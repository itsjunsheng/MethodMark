"""Account-free paper access and submissions; tutor-only attachment previews."""

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


async def store(settings: Annotated[Settings, Depends(get_settings)]):
    async with httpx.AsyncClient(timeout=30) as client:
        yield AssignmentStore(settings, client)


Store = Annotated[AssignmentStore, Depends(store)]
Public = Annotated[None, Depends(limit_access)]


@router.get("/student/assignments/{token}")
async def get_assignment(token: UUID, db: Store, limited: Public):
    return metadata(await db.assignment(token))


@router.post("/student/assignments/{token}/open")
async def open_assignment(token: UUID, payload: StudentCode, db: Store, limited: Public):
    assignment = await db.assignment(token)
    member = await db.member(assignment, payload.student_code)
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
        return await db.submit(token, code, submission_id, drawing, files, drawing_sizes)


@router.get("/submissions/{submission_id}/attachments")
async def get_attachments(
    submission_id: UUID, db: Store, tutor_id: Annotated[str, Depends(require_tutor)]
):
    return await db.attachment_urls(submission_id, tutor_id)
