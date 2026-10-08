"""Private assignment access and submission storage."""

import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.schemas.question import BankQuestion

BUCKET = "student-solutions"


class SnapshotQuestion(BaseModel):
    id: str
    topic: str
    text: str
    method: int = Field(ge=0)
    accuracy: int = Field(ge=0)
    bankQuestion: BankQuestion | None = None


class AssignmentStore:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        secret = settings.supabase_secret_key.get_secret_value()
        if not settings.supabase_url or not secret:
            raise HTTPException(503, "Assignment storage is not configured.")
        self.base = settings.supabase_url.rstrip("/")
        self.client = client
        self.headers = {"apikey": secret}
        if not secret.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {secret}"

    async def request(self, method: str, path: str, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        try:
            response = await self.client.request(
                method, self.base + path, headers=headers, **kwargs
            )
            response.raise_for_status()
            return response.json() if response.content else None
        except httpx.HTTPStatusError as error:
            if error.response.status_code in {400, 409}:
                try:
                    body = error.response.json()
                    if body.get("code") in {"P0001", "23505"}:
                        message = body.get("message")
                        allowed = {
                            "This assignment is unavailable.",
                            "Check your student code with your tutor.",
                            "Your work has already been submitted.",
                            "The submission deadline has passed.",
                        }
                        raise HTTPException(
                            409,
                            message
                            if message in allowed
                            else "Could not submit this work. Reopen the paper and try again.",
                        ) from None
                except (ValueError, KeyError):
                    pass
            raise HTTPException(502, "Could not save or load this assignment. Try again.") from None
        except (httpx.RequestError, ValueError):
            raise HTTPException(502, "Assignment storage is unavailable. Try again.") from None

    async def delete_assignment(self, assignment_id: str, tutor_id: str):
        # The service client bypasses RLS, so ownership is part of the DELETE itself.
        # Cascades remove submissions and grading jobs atomically. Missing rows are
        # a successful no-op, including retries after a lost response or parent deletion.
        await self.request(
            "DELETE",
            "/rest/v1/assignments",
            params={"id": f"eq.{assignment_id}", "tutor_id": f"eq.{tutor_id}"},
            headers={"Prefer": "return=minimal"},
        )

    async def assignment(self, token: UUID):
        rows = await self.request(
            "GET",
            "/rest/v1/assignments",
            params={
                "share_token": f"eq.{token}",
                "status": "eq.published",
                "select": "id,class_id,paper_id,due_at,classes!inner(name),papers!inner(*)",
            },
        )
        if not rows or rows[0]["papers"]["status"] != "published":
            raise HTTPException(
                404, "This assignment is unavailable. Ask your tutor for a new link."
            )
        return rows[0]

    async def member(self, assignment, code: str):
        rows = await self.request(
            "GET",
            "/rest/v1/students",
            params={
                "class_id": f"eq.{assignment['class_id']}",
                "student_code": f"eq.{code}",
                "is_active": "eq.true",
                "select": "id,student_code",
            },
        )
        if not rows:
            raise HTTPException(403, "Check your student code with your tutor.")
        return rows[0]

    async def receipt(self, assignment_id, student_id):
        rows = await self.request(
            "GET",
            "/rest/v1/submissions",
            params={
                "assignment_id": f"eq.{assignment_id}",
                "student_id": f"eq.{student_id}",
                "select": "id,submitted_at",
            },
        )
        return rows[0] if rows else None

    async def released_result(self, submission_id: str):
        # Only the released copy is read; drafts and AI proposals never reach students.
        rows = await self.request(
            "GET",
            "/rest/v1/results",
            params={"submission_id": f"eq.{submission_id}", "select": "review,released_at"},
        )
        return rows[0] if rows else None

    async def upload(self, assignment, member, submission_id, files):
        uploaded = []
        attempt = uuid4()
        try:
            for index, (name, mime, content) in enumerate(files):
                ext = "jpg" if mime == "image/jpeg" else "png"
                path = f"{assignment['id']}/{member['id']}/{submission_id}/{attempt}-{index}.{ext}"
                await self.request(
                    "POST",
                    f"/storage/v1/object/{BUCKET}/{path}",
                    content=content,
                    headers={"Content-Type": mime, "x-upsert": "false"},
                )
                uploaded.append({"path": path, "name": name, "mime_type": mime})
        except HTTPException:
            await self.cleanup(uploaded)
            raise
        return uploaded

    async def cleanup(self, attachments):
        if attachments:
            try:
                await self.request(
                    "DELETE",
                    f"/storage/v1/object/{BUCKET}",
                    json={
                        "prefixes": [attachment["path"] for attachment in attachments],
                    },
                )
            except HTTPException:
                pass  # Keep the original error; unreferenced files stay private.

    async def submit(self, token, code, submission_id, drawing, files, drawing_sizes=None):
        assignment = await self.assignment(token)
        member = await self.member(assignment, code)
        existing = await self.receipt(assignment["id"], member["id"])
        if existing:
            if existing["id"] == str(submission_id):
                return {"id": existing["id"], "submitted_at": existing["submitted_at"]}
            raise HTTPException(409, "Your work has already been submitted.")
        if is_due(assignment["due_at"]):
            raise HTTPException(409, "The submission deadline has passed.")
        validate_drawing(drawing, assignment["papers"]["questions_snapshot"])
        drawing_sizes = drawing_sizes if drawing_sizes is not None else {}
        validate_drawing_sizes(drawing_sizes, assignment["papers"]["questions_snapshot"])
        if not any(drawing.values()) and not files:
            raise HTTPException(422, "Add handwriting or photos before submitting.")
        attachments = await self.upload(assignment, member, submission_id, files)
        try:
            receipt = await self.request(
                "POST",
                "/rest/v1/rpc/record_student_submission",
                json={
                    "p_token": str(token),
                    "p_code": code,
                    "p_id": str(submission_id),
                    "p_drawing": drawing,
                    "p_drawing_sizes": drawing_sizes,
                    "p_attachments": attachments,
                },
            )
        except HTTPException as error:
            if error.status_code == 409:
                await self.cleanup(attachments)
            # A network failure may hide a committed transaction. Do not delete its work.
            raise
        if isinstance(receipt, list):
            receipt = receipt[0]
        kept = {entry["path"] for entry in receipt["attachments"]}
        await self.cleanup([entry for entry in attachments if entry["path"] not in kept])
        return {"id": receipt["id"], "submitted_at": receipt["submitted_at"]}

    async def attachment_urls(self, submission_id: UUID, tutor_id: str):
        rows = await self.request(
            "GET",
            "/rest/v1/submissions",
            params={
                "id": f"eq.{submission_id}",
                "assignments.tutor_id": f"eq.{tutor_id}",
                "select": "assignment_id,student_id,attachments,assignments!inner(tutor_id)",
            },
        )
        if not rows:
            raise HTTPException(404, "Submission not found.")
        record = rows[0]
        prefix = f"{record['assignment_id']}/{record['student_id']}/{submission_id}/"
        urls = []
        for attachment in record["attachments"]:
            path = attachment["path"]
            if not path.startswith(prefix) or ".." in path:
                raise HTTPException(502, "Invalid attachment.")
            result = await self.request(
                "POST", f"/storage/v1/object/sign/{BUCKET}/{path}", json={"expiresIn": 300}
            )
            urls.append(
                {"name": attachment["name"], "url": self.base + "/storage/v1" + result["signedURL"]}
            )
        return urls


def is_due(due_at: str | None) -> bool:
    return bool(
        due_at and datetime.fromisoformat(due_at.replace("Z", "+00:00")) <= datetime.now(UTC)
    )


def metadata(assignment):
    paper = assignment["papers"]
    return {
        "id": assignment["id"],
        "class_name": assignment["classes"]["name"],
        "title": paper["title"],
        "due_at": assignment["due_at"],
        "duration": paper["duration_minutes"],
        "question_count": paper["question_count"],
        "accepting_submissions": not is_due(assignment["due_at"]),
    }


def student_paper(paper):
    # Construct a student-only projection; never forward the saved snapshot.
    questions = []
    for raw in paper["questions_snapshot"]:
        q = SnapshotQuestion.model_validate(raw)
        item = {
            "id": q.id,
            "topic": q.topic,
            "text": q.text,
            "method": q.method,
            "accuracy": q.accuracy,
        }
        if q.bankQuestion:
            item["question_content"] = q.bankQuestion.question_content.model_dump()
            item["marks_by_part"] = {
                part.part_id: sum(point.max_marks for point in part.marking_points)
                for part in q.bankQuestion.marking_rubric.parts
            }
        questions.append(item)
    return {
        "id": paper["id"],
        "title": paper["title"],
        "subject": paper["subject"],
        "school_year": paper["school_year"],
        "subject_level": paper["subject_level"],
        "duration": paper["duration_minutes"],
        "instructions": paper["instructions"],
        "questions": questions,
    }


def validate_drawing(drawing, questions):
    if not isinstance(drawing, dict) or len(drawing) > 500:
        raise HTTPException(422, "Invalid handwriting.")
    areas = set()
    for raw in questions:
        question = SnapshotQuestion.model_validate(raw)
        parts = question.bankQuestion.question_content.parts if question.bankQuestion else []
        for part_id in [part.id for part in parts] or ["main"]:
            areas.add(json.dumps([question.id, part_id], separators=(",", ":")))
    points = 0
    for area, strokes in drawing.items():
        if area not in areas or not isinstance(strokes, list):
            raise HTTPException(422, "Handwriting does not match this paper.")
        for stroke in strokes:
            if not isinstance(stroke, list) or not stroke:
                raise HTTPException(422, "Invalid handwriting.")
            points += len(stroke)
            if points > 100000:
                raise HTTPException(422, "Too much handwriting in one submission.")
            for point in stroke:
                if (
                    not isinstance(point, list)
                    or len(point) != 2
                    or any(type(n) not in (int, float) or not 0 <= n <= 1 for n in point)
                ):
                    raise HTTPException(422, "Invalid handwriting coordinates.")


def validate_drawing_sizes(sizes, questions):
    if not isinstance(sizes, dict) or len(sizes) > 500:
        raise HTTPException(422, "Invalid answer space dimensions.")
    validate_drawing({key: [] for key in sizes}, questions)
    for size in sizes.values():
        if (
            not isinstance(size, list)
            or len(size) != 2
            or any(type(n) not in (int, float) or not 1 <= n <= 10000 for n in size)
            or not 0.02 <= size[1] / size[0] <= 5
        ):
            raise HTTPException(422, "Invalid answer space dimensions.")
