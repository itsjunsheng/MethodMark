"""Account-free paper access, submissions and released results; tutor-only attachment previews."""

import json
import warnings
from collections import defaultdict, deque
from io import BytesIO
from time import monotonic
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError, field_validator
from starlette.datastructures import UploadFile

from app.api.dependencies import get_settings, require_tutor
from app.core.config import Settings
from app.grading.results import student_result
from app.grading.schemas import GradingError
from app.services.assignments import AssignmentStore, metadata, student_paper

router = APIRouter(tags=["Assignments"])


class StudentCode(BaseModel):
    student_code: str = Field(min_length=3, max_length=50, pattern=r"^[a-z]+-[a-z]+$")

    @field_validator("student_code", mode="before")
    @classmethod
    def normalize(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


def limit_access(request: Request):
    # Per-process IP limit. Use a shared limiter when deploying multiple workers.
    attempts = getattr(request.app.state, "student_attempts", None)
    if attempts is None:
        attempts = request.app.state.student_attempts = defaultdict(deque)
    key = request.client.host if request.client else "unknown"
    now = monotonic()
    queue = attempts[key]
    while queue and queue[0] < now - 60:
        queue.popleft()
    if len(queue) >= 120:
        raise HTTPException(
            429, "Too many attempts. Please wait a minute.", headers={"Retry-After": "60"}
        )
    queue.append(now)
    if len(attempts) > 10000:
        for old_key in list(attempts):
            if attempts[old_key][-1] < now - 60:
                del attempts[old_key]


# Codes are short (24 colours x 48 animals), so wrong guesses are capped per link and address.
WRONG_CODES, WRONG_CODE_WINDOW = 10, 15 * 60
WRONG_CODE_MESSAGES = {"Check your student code with your tutor."}


def wrong_codes(request: Request, token: UUID):
    failures = getattr(request.app.state, "wrong_codes", None)
    if failures is None:
        failures = request.app.state.wrong_codes = defaultdict(deque)
    key = (request.client.host if request.client else "unknown", str(token))
    queue = failures[key]
    while queue and queue[0] < monotonic() - WRONG_CODE_WINDOW:
        queue.popleft()
    return queue


def check_code_attempts(request: Request, token: UUID):
    if len(wrong_codes(request, token)) >= WRONG_CODES:
        raise HTTPException(
            429,
            "Too many incorrect student codes. Please wait 15 minutes or ask your tutor.",
            headers={"Retry-After": str(WRONG_CODE_WINDOW)},
        )


def note_wrong_code(request: Request, token: UUID, error: HTTPException):
    if error.status_code == 403 or (
        error.status_code == 409 and error.detail in WRONG_CODE_MESSAGES
    ):
        wrong_codes(request, token).append(monotonic())


async def store(settings: Annotated[Settings, Depends(get_settings)]):
    async with httpx.AsyncClient(timeout=30) as client:
        yield AssignmentStore(settings, client)


Store = Annotated[AssignmentStore, Depends(store)]
Public = Annotated[None, Depends(limit_access)]


@router.get("/student/assignments/{token}")
async def get_assignment(token: UUID, db: Store, limited: Public):
    return metadata(await db.assignment(token))


async def verified_member(request: Request, token: UUID, code: str, db: AssignmentStore):
    check_code_attempts(request, token)
    assignment = await db.assignment(token)
    try:
        return assignment, await db.member(assignment, code)
    except HTTPException as error:
        note_wrong_code(request, token, error)
        raise


@router.post("/student/assignments/{token}/open")
async def open_assignment(
    token: UUID, payload: StudentCode, request: Request, db: Store, limited: Public
):
    assignment, member = await verified_member(request, token, payload.student_code, db)
    receipt = await db.receipt(assignment["id"], member["id"])
    try:
        paper = student_paper(assignment["papers"])
    except (ValidationError, KeyError, TypeError):
        raise HTTPException(
            502, "This paper could not be opened. Please contact your tutor."
        ) from None
    return {
        "assignment": metadata(assignment),
        "paper": paper,
        "student_code": member["student_code"],
        "submitted_at": receipt["submitted_at"] if receipt else None,
    }


@router.post("/student/assignments/{token}/submit")
async def submit_assignment(token: UUID, request: Request, db: Store, limited: Public):
    check_code_attempts(request, token)
    try:
        size = int(request.headers.get("content-length", "0"))
    except ValueError:
        raise HTTPException(400, "Invalid request size.") from None
    if size > 55 * 1024 * 1024:
        raise HTTPException(413, "Submit up to 5 photos, 10 MB each.")
    async with request.form(max_files=5, max_fields=4, max_part_size=2 * 1024 * 1024) as form:
        try:
            code = StudentCode(student_code=form.get("student_code")).student_code
            submission_id = UUID(str(form.get("submission_id")))
            raw = form.get("drawing", "{}")
            if not isinstance(raw, str) or len(raw) > 2 * 1024 * 1024:
                raise ValueError
            drawing = json.loads(raw)
            drawing_sizes = json.loads(str(form.get("drawing_sizes", "{}")))
        except (ValueError, TypeError):
            raise HTTPException(422, "Check your student code and submission.") from None
        files = []
        for upload in form.getlist("files"):
            if not isinstance(upload, UploadFile):
                raise HTTPException(422, "Choose JPG or PNG photos.")
            content = await upload.read(10 * 1024 * 1024 + 1)
            if len(content) > 10 * 1024 * 1024:
                raise HTTPException(413, "Each photo must be under 10 MB.")
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(BytesIO(content)) as image:
                        mime = {"JPEG": "image/jpeg", "PNG": "image/png"}.get(image.format)
                        if not mime or image.width * image.height > 25_000_000:
                            raise ValueError
                        image.verify()
            except (
                UnidentifiedImageError,
                OSError,
                ValueError,
                Image.DecompressionBombWarning,
                Image.DecompressionBombError,
            ):
                raise HTTPException(
                    422, "Choose readable JPG or PNG photos up to 25 megapixels."
                ) from None
            files.append(((upload.filename or "Solution")[:200], mime, content))
        try:
            return await db.submit(token, code, submission_id, drawing, files, drawing_sizes)
        except HTTPException as error:
            note_wrong_code(request, token, error)
            raise


@router.post("/student/assignments/{token}/result")
async def get_result(
    token: UUID, payload: StudentCode, request: Request, db: Store, limited: Public
):
    # UC12: the same link and code as the paper; only this student's released result is returned.
    assignment, member = await verified_member(request, token, payload.student_code, db)
    receipt = await db.receipt(assignment["id"], member["id"])
    if not receipt:
        return {"status": "not_submitted"}
    released = await db.released_result(receipt["id"])
    if not released:
        return {"status": "pending", "submitted_at": receipt["submitted_at"]}
    try:
        result = student_result(released["review"], assignment["papers"])
    except (GradingError, KeyError, TypeError, ValueError):
        raise HTTPException(502, "Your result could not be loaded. Please try again.") from None
    return {
        "status": "released",
        "submitted_at": receipt["submitted_at"],
        "released_at": released["released_at"],
        "result": result,
    }


@router.get("/submissions/{submission_id}/attachments")
async def get_attachments(
    submission_id: UUID, db: Store, tutor_id: Annotated[str, Depends(require_tutor)]
):
    return await db.attachment_urls(submission_id, tutor_id)
