"""Authenticated review queue. No result-release endpoint exists in this phase."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_settings, require_tutor
from app.core.config import Settings
from app.grading.pipeline import blank_result, validate_review
from app.grading.schemas import GradingError, SaveReview
from app.grading.store import GradingStore

router = APIRouter(prefix="/grading", tags=["Grading"])


async def store(settings: Annotated[Settings, Depends(get_settings)]):
    async with httpx.AsyncClient(timeout=30) as client:
        yield GradingStore(settings, client)


Store = Annotated[GradingStore, Depends(store)]
Tutor = Annotated[str, Depends(require_tutor)]


@router.get("")
async def queue(db: Store, tutor: Tutor):
    return await db.queue(tutor)


@router.get("/{submission_id}")
async def detail(submission_id: UUID, db: Store, tutor: Tutor):
    job = await db.owned_job(str(submission_id), tutor)
    if job["status"] in ("queued", "processing"):
        raise HTTPException(409, "This submission is still being processed.")
    submission = job.pop("submissions")
    assignment = submission.pop("assignments")
    paper = assignment["papers"]
    manual_error = None
    if job["result"] is None:
        try:
            job["result"] = blank_result(paper)
        except GradingError as error:
            manual_error = str(error)
    photos = await db.attachment_urls(submission_id, tutor) if submission["attachments"] else []
    return {
        "job": job,
        "submission": submission,
        "paper": paper,
        "photos": photos,
        "class_name": assignment["classes"]["name"],
        "manual_error": manual_error,
    }


@router.post("/{submission_id}/retry")
async def retry(submission_id: UUID, db: Store, tutor: Tutor):
    job = await db.owned_job(str(submission_id), tutor)
    if job["status"] != "failed" or job["review_draft"] is not None:
        raise HTTPException(
            409, "Only failed assessments without saved review edits can be retried."
        )
    await db.edit(
        job,
        {
            "status": "queued",
            "error": None,
            "attempts": 0,
            "lease_token": None,
            "lease_expires_at": None,
        },
        tutor_id=tutor,
    )
    return {"status": "queued"}


@router.put("/{submission_id}/review")
async def save_review(submission_id: UUID, payload: SaveReview, db: Store, tutor: Tutor):
    job = await db.owned_job(str(submission_id), tutor)
    if job["status"] not in ("awaiting_review", "failed") or job["version"] != payload.version:
        raise HTTPException(409, "This assessment changed. Reopen it before saving.")
    try:
        validate_review(payload.draft, job["submissions"]["assignments"]["papers"])
    except GradingError as error:
        raise HTTPException(422, str(error)) from None
    saved = await db.edit(
        job,
        {
            "review_draft": payload.draft.model_dump(),
            "review_saved_at": datetime.now(UTC).isoformat(),
            "status": "awaiting_review",
        },
        tutor_id=tutor,
    )
    return {"version": saved["version"], "review_saved_at": saved["review_saved_at"]}
