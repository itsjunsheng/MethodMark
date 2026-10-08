"""Authenticated review queue, tutor review and result release (UC7, UC8)."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_settings, require_tutor
from app.core.config import Settings
from app.grading.pipeline import blank_result, review_complete, validate_review
from app.grading.schemas import GradingError, ReopenResult, SaveReview
from app.grading.store import GradingStore, released_at

router = APIRouter(prefix="/grading", tags=["Grading"])


async def store(settings: Annotated[Settings, Depends(get_settings)]):
    async with httpx.AsyncClient(timeout=30) as client:
        yield GradingStore(settings, client)


Store = Annotated[GradingStore, Depends(store)]
Tutor = Annotated[str, Depends(require_tutor)]


@router.get("")
async def queue(db: Store, tutor: Tutor):
    return await db.queue(tutor)


@router.post("/classes/{class_id}/send")
async def send_class(class_id: UUID, db: Store, tutor: Tutor):
    return {"queued": await db.send_class(str(class_id), tutor)}


@router.get("/{submission_id}")
async def detail(submission_id: UUID, db: Store, tutor: Tutor):
    job = await db.owned_job(str(submission_id), tutor)
    if job["status"] == "submitted":
        raise HTTPException(409, "Send this class for grading before reviewing this submission.")
    if job["status"] in ("queued", "processing"):
        raise HTTPException(409, "This submission is still being processed.")
    submission = job.pop("submissions")
    assignment = submission.pop("assignments")
    released = released_at(submission)
    submission.pop("results", None)
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
        "released_at": released,
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


async def reviewable(submission_id: UUID, payload: SaveReview, db: GradingStore, tutor: str):
    job = await db.owned_job(str(submission_id), tutor)
    if job["status"] == "released":
        raise HTTPException(409, "This result has been released. Reopen it to make changes.")
    if job["status"] not in ("awaiting_review", "failed") or job["version"] != payload.version:
        raise HTTPException(409, "This assessment changed. Reopen it before saving.")
    try:
        validate_review(payload.draft, job["submissions"]["assignments"]["papers"])
    except GradingError as error:
        raise HTTPException(422, str(error)) from None
    return job


@router.put("/{submission_id}/review")
async def save_review(submission_id: UUID, payload: SaveReview, db: Store, tutor: Tutor):
    job = await reviewable(submission_id, payload, db, tutor)
    saved = await db.edit(
        job,
        {
            "review_draft": payload.draft.model_dump(),
            "review_saved_at": datetime.now(UTC).isoformat(),
            "reviewed_by": tutor,
            "status": "awaiting_review",
        },
        tutor_id=tutor,
    )
    return {"version": saved["version"], "review_saved_at": saved["review_saved_at"]}


@router.post("/{submission_id}/release")
async def release(submission_id: UUID, payload: SaveReview, db: Store, tutor: Tutor):
    # Approve and Release (UC8 8.0.5-8.0.8): only a complete, valid review reaches the student.
    job = await reviewable(submission_id, payload, db, tutor)
    review = payload.draft.model_dump()
    if not review_complete(review):
        raise HTTPException(
            422, "Check every part and assess every marking point before releasing."
        )
    released = await db.release(job, review, tutor)
    return {"version": released["version"], "released_at": released["released_at"]}


@router.post("/{submission_id}/reopen")
async def reopen(submission_id: UUID, payload: ReopenResult, db: Store, tutor: Tutor):
    job = await db.owned_job(str(submission_id), tutor)
    if job["status"] != "released" or job["version"] != payload.version:
        raise HTTPException(409, "This result changed. Close it and open it again.")
    return await db.reopen(job, tutor)
