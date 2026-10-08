"""Supabase persistence with explicit tutor ownership and worker lease checks."""

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.grading.evidence import photo_content
from app.grading.pipeline import review_complete
from app.grading.schemas import GradingError
from app.services.assignments import BUCKET, AssignmentStore


class LeaseLost(Exception):
    pass


class GradingStore(AssignmentStore):
    async def owned_job(self, submission_id: str, tutor_id: str):
        rows = await self.request(
            "GET",
            "/rest/v1/grading_jobs",
            params={
                "submission_id": "eq." + submission_id,
                "submissions.assignments.tutor_id": "eq." + tutor_id,
                "select": (
                    "*,submissions!inner(*,students(name),"
                    "assignments!inner(tutor_id,paper_id,classes(name),papers(*)))"
                ),
            },
        )
        if not rows:
            raise HTTPException(404, "This submission is unavailable.")
        return rows[0]

    async def queue(self, tutor_id: str):
        rows = []
        for offset in range(0, 100000, 500):
            batch = await self.request(
                "GET",
                "/rest/v1/grading_jobs",
                params={
                    "select": (
                        "submission_id,status,flagged,error,attempts,version,review_saved_at,"
                        "review_draft,created_at,updated_at,"
                        "submissions!inner(student_code,submitted_at,"
                        "students(name),assignments!inner(tutor_id,class_id,classes(name),papers(title)))"
                    ),
                    "submissions.assignments.tutor_id": "eq." + tutor_id,
                    "order": "created_at.desc,submission_id",
                    "offset": offset,
                    "limit": 500,
                },
            )
            for row in batch:
                submission = row.pop("submissions")
                assignment = submission["assignments"]
                # The list only says whether the review is finished; drafts stay in the detail.
                row.update(
                    review_complete=review_complete(row.pop("review_draft", None)),
                    student_code=submission["student_code"],
                    student_name=(submission.get("students") or {}).get("name"),
                    paper_title=assignment["papers"]["title"],
                    class_name=assignment["classes"]["name"],
                    class_id=assignment["class_id"],
                    submitted_at=submission["submitted_at"],
                )
            rows.extend(batch)
            if len(batch) < 500:
                return rows
        raise HTTPException(503, "Too many submissions to load. Please contact your administrator.")

    async def send_class(self, class_id: str, tutor_id: str):
        classes = await self.request(
            "GET", "/rest/v1/classes",
            params={"id": "eq." + class_id, "tutor_id": "eq." + tutor_id, "select": "id"},
        )
        if not classes:
            raise HTTPException(404, "This class is unavailable.")
        # Atomically queue only unsent work and recheck ownership in the database.
        return await self.request(
            "POST", "/rest/v1/rpc/send_class_for_grading",
            json={"p_class_id": class_id, "p_tutor_id": tutor_id},
        )

    async def edit(self, job, patch, *, tutor_id: str):
        # Recheck ownership before every write; version prevents two tutors/tabs overwriting edits.
        await self.owned_job(job["submission_id"], tutor_id)
        patch.update(version=job["version"] + 1, updated_at=datetime.now(UTC).isoformat())
        rows = await self.request(
            "PATCH",
            "/rest/v1/grading_jobs",
            params={
                "submission_id": "eq." + job["submission_id"],
                "version": "eq." + str(job["version"]),
                "status": "eq." + job["status"],
            },
            json=patch,
            headers={"Prefer": "return=representation"},
        )
        if not rows:
            raise HTTPException(
                409, "This assessment changed. Reopen it before saving or retrying."
            )
        return rows[0]

    async def claim(self):
        rows = await self.request("POST", "/rest/v1/rpc/claim_grading_job", json={})
        return rows[0] if rows else None

    async def worker_update(self, job, patch):
        patch["updated_at"] = datetime.now(UTC).isoformat()
        rows = await self.request(
            "PATCH",
            "/rest/v1/grading_jobs",
            params={
                "submission_id": "eq." + job["submission_id"],
                "lease_token": "eq." + job["lease_token"],
                "status": "eq.processing",
                "lease_expires_at": "gt." + datetime.now(UTC).isoformat(),
            },
            json=patch,
            headers={"Prefer": "return=representation"},
        )
        if not rows:
            raise LeaseLost

    async def heartbeat(self, job):
        await self.worker_update(
            job, {"lease_expires_at": (datetime.now(UTC) + timedelta(minutes=10)).isoformat()}
        )

    async def submission(self, submission_id):
        rows = await self.request(
            "GET",
            "/rest/v1/submissions",
            params={"id": "eq." + submission_id, "select": "*,assignments!inner(papers(*))"},
        )
        if not rows:
            raise LeaseLost
        return rows[0]

    async def photos(self, submission):
        photos = []
        prefix = f"{submission['assignment_id']}/{submission['student_id']}/{submission['id']}/"
        for attachment in submission["attachments"]:
            path = attachment["path"]
            if not path.startswith(prefix) or ".." in path:
                raise GradingError("A submitted photo has an invalid storage reference.")
            try:
                async with self.client.stream(
                    "GET",
                    self.base
                    + f"/storage/v1/object/authenticated/{BUCKET}/"
                    + quote(path, safe="/"),
                    headers=self.headers,
                ) as response:
                    response.raise_for_status()
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 10 * 1024 * 1024:
                            raise GradingError("A submitted photo exceeds the supported size.")
                photos.append(photo_content(bytes(data)))
            except httpx.HTTPError:
                raise GradingError(
                    "A submitted photo could not be downloaded. Retry or review it manually."
                ) from None
        return photos
