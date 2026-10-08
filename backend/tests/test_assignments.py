import asyncio
import json
from copy import deepcopy
from io import BytesIO
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from test_questions import question, settings

from app.api.dependencies import require_tutor
from app.api.routes.student_assignments import store
from app.main import create_app
from app.services.assignments import AssignmentStore, student_paper, validate_drawing

TOKEN, ASSIGNMENT, STUDENT, SUBMISSION = [str(uuid4()) for _ in range(4)]
QUESTION = {
    "id": "q1",
    "text": "Solve x + 2 = 5.",
    "topic": "Algebra",
    "method": 0,
    "accuracy": 1,
    "solution": "SECRET SOLUTION",
    "bankQuestion": question(),
}
PAPER = {
    "id": str(uuid4()),
    "title": "Weekly algebra",
    "subject": "Mathematics",
    "school_year": 3,
    "subject_level": "G3",
    "duration_minutes": 45,
    "instructions": "Show your working.",
    "questions_snapshot": [QUESTION],
    "question_count": 1,
    "status": "published",
}
ASSIGNED = {
    "id": ASSIGNMENT,
    "class_id": str(uuid4()),
    "paper_id": PAPER["id"],
    "due_at": "2099-01-01T00:00:00Z",
    "classes": {"name": "Saturday"},
    "papers": PAPER,
}
DRAWING = {'["q1","main"]': [[[0.1, 0.2], [0.3, 0.4]]]}
RECEIPT = {"id": SUBMISSION, "submitted_at": "2026-09-29T04:00:00Z", "attachments": []}


def client_with(db):
    app = create_app(settings())
    app.dependency_overrides[store] = lambda: db
    return TestClient(app)


def fake_store():
    return AsyncMock(
        assignment=AsyncMock(return_value=deepcopy(ASSIGNED)),
        member=AsyncMock(return_value={"id": STUDENT, "student_code": "blue-otter"}),
        receipt=AsyncMock(return_value=None),
        submit=AsyncMock(return_value=RECEIPT),
    )


def test_open_requires_class_code_and_never_returns_solutions():
    db = fake_store()
    with client_with(db) as client:
        meta = client.get(f"/api/v1/student/assignments/{TOKEN}")
        assert meta.status_code == 200
        assert "questions" not in meta.text
        response = client.post(
            f"/api/v1/student/assignments/{TOKEN}/open", json={"student_code": " BLUE-OTTER "}
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["paper"]["questions"][0]["marks_by_part"] == {"main": 1}
        assert (
            payload["paper"]["questions"][0]["question_content"] == question()["question_content"]
        )
        for secret in ["solution", "marking_rubric", "criterion", "Correct answer", "x = 3"]:
            assert secret not in response.text
        db.member.assert_awaited_once_with(ASSIGNED, "blue-otter")
        db.member.side_effect = HTTPException(403, "Check your code.")
        denied = client.post(
            f"/api/v1/student/assignments/{TOKEN}/open", json={"student_code": "red-fox"}
        )
        assert denied.status_code == 403
        assert "questions" not in denied.text


def test_reopening_submitted_work_returns_receipt_without_student_answers():
    db = fake_store()
    db.receipt.return_value = {
        **RECEIPT,
        "drawing": DRAWING,
        "attachments": [{"path": "private/work.png", "name": "work.png"}],
    }
    with client_with(db) as client:
        response = client.post(
            f"/api/v1/student/assignments/{TOKEN}/open", json={"student_code": "blue-otter"}
        )
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"assignment", "paper", "student_code", "submitted_at"}
    assert payload["submitted_at"] == RECEIPT["submitted_at"]
    for private_field in ["drawing", "attachments", "private/work.png"]:
        assert private_field not in response.text


def test_snapshot_projection_keeps_only_allowed_fields():
    original = deepcopy(PAPER)
    original["questions_snapshot"][0]["internal_note"] = "Private"
    projected = student_paper(original)
    assert "internal_note" not in json.dumps(projected)
    assert "solution" not in json.dumps(projected)
    assert original["questions_snapshot"][0]["solution"] == "SECRET SOLUTION"


@pytest.mark.parametrize(
    "drawing",
    [
        [],
        {'["other","main"]': [[[0.1, 0.2]]]},
        {'["q1","wrong"]': [[[0.1, 0.2]]]},
        {'["q1","main"]': [[]]},
        {'["q1","main"]': [[[1.1, 0.2]]]},
        {'["q1","main"]': [[[True, 0.2]]]},
        {'["q1","main"]': [[[float("nan"), 0.2]]]},
    ],
)
def test_rejects_invalid_handwriting_and_other_question_ids(drawing):
    with pytest.raises(HTTPException) as error:
        validate_drawing(drawing, [QUESTION])
    assert error.value.status_code == 422


def test_submits_ink_and_verified_image_without_login():
    db = fake_store()
    image = BytesIO()
    Image.new("RGB", (10, 10), "white").save(image, format="PNG")
    with client_with(db) as client:
        result = client.post(
            f"/api/v1/student/assignments/{TOKEN}/submit",
            data={
                "student_code": "blue-otter",
                "submission_id": SUBMISSION,
                "drawing": json.dumps(DRAWING),
                "drawing_sizes": json.dumps({'["q1","main"]': [400, 200]}),
            },
            files={"files": ("work.png", image.getvalue(), "image/png")},
        )
        assert result.status_code == 200
        assert result.json()["id"] == SUBMISSION
    args = db.submit.await_args.args
    assert str(args[2]) == SUBMISSION
    assert args[5] == {'["q1","main"]': [400, 200]}
    assert args[3] == DRAWING
    assert args[4][0][1] == "image/png"


def test_invalid_photo_is_never_uploaded_or_recorded():
    db = fake_store()
    with client_with(db) as client:
        result = client.post(
            f"/api/v1/student/assignments/{TOKEN}/submit",
            data={
                "student_code": "blue-otter",
                "submission_id": SUBMISSION,
                "drawing": "{}",
            },
            files={"files": ("fake.png", b"not an image", "image/png")},
        )
        assert result.status_code == 422
    db.submit.assert_not_awaited()


def test_attachment_previews_require_tutor_authentication():
    db = fake_store()
    with client_with(db) as client:
        assert client.get(f"/api/v1/submissions/{SUBMISSION}/attachments").status_code == 401
        client.app.dependency_overrides[require_tutor] = lambda: "verified-tutor"
        db.attachment_urls.return_value = []
        assert client.get(f"/api/v1/submissions/{SUBMISSION}/attachments").json() == []
    db.attachment_urls.assert_awaited_once()
    assert db.attachment_urls.await_args.args[1] == "verified-tutor"


def test_public_endpoints_rate_limit_repeated_attempts():
    db = fake_store()
    with client_with(db) as client:
        for _ in range(120):
            assert client.get(f"/api/v1/student/assignments/{TOKEN}").status_code == 200
        assert client.get(f"/api/v1/student/assignments/{TOKEN}").status_code == 429


def run_store(callback, handler=None):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler or (lambda request: httpx.Response(200, json={})))
        ) as client:
            db = AssignmentStore(settings(), client)
            db.assignment = AsyncMock(return_value=deepcopy(ASSIGNED))
            db.member = AsyncMock(return_value={"id": STUDENT, "student_code": "blue-otter"})
            db.receipt = AsyncMock(return_value=None)
            return await callback(db)

    return asyncio.run(run())


def test_retries_return_existing_receipt_without_uploading_twice():
    async def check(db):
        db.receipt.return_value = RECEIPT
        db.upload = AsyncMock()
        result = await db.submit(TOKEN, "blue-otter", SUBMISSION, {}, [])
        assert result == {"id": SUBMISSION, "submitted_at": RECEIPT["submitted_at"]}
        db.upload.assert_not_awaited()
        with pytest.raises(HTTPException) as error:
            await db.submit(TOKEN, "blue-otter", str(uuid4()), DRAWING, [])
        assert error.value.status_code == 409

    run_store(check)


def test_deadline_and_empty_work_rejected_before_upload():
    async def check(db):
        db.upload = AsyncMock()
        with pytest.raises(HTTPException) as error:
            await db.submit(TOKEN, "blue-otter", SUBMISSION, {}, [])
        assert error.value.status_code == 422
        db.assignment.return_value["due_at"] = "2000-01-01T00:00:00Z"
        with pytest.raises(HTTPException) as error:
            await db.submit(TOKEN, "blue-otter", SUBMISSION, DRAWING, [])
        assert error.value.status_code == 409
        db.upload.assert_not_awaited()

    run_store(check)


def test_failed_photo_upload_does_not_create_a_submission_and_cleans_partial_files():
    requests = []

    def handle(request):
        requests.append(request)
        if request.method == "DELETE":
            return httpx.Response(200, json=[])
        return httpx.Response(200 if len(requests) == 1 else 500, json={})

    async def check(db):
        with pytest.raises(HTTPException):
            await db.submit(
                TOKEN,
                "blue-otter",
                SUBMISSION,
                {},
                [("one.png", "image/png", b"one"), ("two.png", "image/png", b"two")],
            )

    run_store(check, handle)
    assert len(requests) == 3
    assert requests[-1].method == "DELETE"
    assert all("/rpc/" not in str(r.url) for r in requests)


@pytest.mark.parametrize(
    "status,code,cleaned", [(400, "P0001", True), (409, "23505", True), (502, "", False)]
)
def test_finalization_failure_cleans_only_when_commit_is_known_to_have_failed(
    status, code, cleaned
):
    async def check(db):
        db.upload = AsyncMock(return_value=[{"path": "private/file.png", "name": "work.png"}])
        db.cleanup = AsyncMock()
        with pytest.raises(HTTPException):
            await db.submit(TOKEN, "blue-otter", SUBMISSION, DRAWING, [])
        assert db.cleanup.await_count == int(cleaned)

    run_store(
        check,
        lambda request: httpx.Response(status, json={"code": code, "message": "Deadline passed"}),
    )


def test_signed_photo_urls_are_scoped_to_the_verified_tutor():
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=[])

    async def check(db):
        with pytest.raises(HTTPException) as error:
            await db.attachment_urls(SUBMISSION, "verified-tutor")
        assert error.value.status_code == 404

    run_store(check, handle)
    assert requests[0].url.params["assignments.tutor_id"] == "eq.verified-tutor"
    assert len(requests) == 1


@pytest.mark.parametrize("active", [True, False])
def test_student_lookup_scopes_code_to_assignment_class_and_active_records(active):
    requests = []

    def handle(request):
        requests.append(request)
        rows = [{"id": STUDENT, "student_code": "blue-otter"}] if active else []
        return httpx.Response(200, json=rows)

    async def check(db):
        if active:
            member = await AssignmentStore.member(db, ASSIGNED, "blue-otter")
            assert member["id"] == STUDENT
        else:
            with pytest.raises(HTTPException) as error:
                await AssignmentStore.member(db, ASSIGNED, "blue-otter")
            assert error.value.status_code == 403

    run_store(check, handle)
    assert requests[0].url.path == "/rest/v1/students"
    assert dict(requests[0].url.params) == {
        "class_id": f"eq.{ASSIGNED['class_id']}",
        "student_code": "eq.blue-otter",
        "is_active": "eq.true",
        "select": "id,student_code",
    }


RELEASED = {
    "review": {
        "questions": [
            {
                "question_id": "q1",
                "parts": [
                    {
                        "part_id": "main",
                        "checked": True,
                        "feedback": " Subtract 2 from both sides first. ",
                        "points": [{"point_id": "a1", "awarded": 0}],
                    }
                ],
            }
        ]
    },
    "released_at": "2026-10-09T02:00:00Z",
}


def test_results_show_only_this_students_released_marks_and_feedback():
    db = fake_store()
    path = f"/api/v1/student/assignments/{TOKEN}/result"
    with client_with(db) as client:
        assert client.post(path, json={"student_code": "blue-otter"}).json() == {
            "status": "not_submitted"
        }
        db.receipt.return_value = RECEIPT
        db.released_result.return_value = None
        pending = client.post(path, json={"student_code": "blue-otter"}).json()
        assert pending == {"status": "pending", "submitted_at": RECEIPT["submitted_at"]}
        db.released_result.return_value = deepcopy(RELEASED)
        response = client.post(path, json={"student_code": " BLUE-OTTER "})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "released" and payload["released_at"] == RELEASED["released_at"]
    result = payload["result"]
    assert (result["earned"], result["available"]) == (0, 1)
    assert result["accuracy"] == {"earned": 0, "available": 1}
    assert result["method"] == {"earned": 0, "available": 0}
    part = result["questions"][0]["parts"][0]
    assert part["marks"] == [{"code": "A1", "awarded": 0, "max_marks": 1}]
    assert part["feedback"] == "Subtract 2 from both sides first."
    db.member.assert_awaited_with(ASSIGNED, "blue-otter")
    db.released_result.assert_awaited_with(SUBMISSION)
    private = ["SECRET SOLUTION", "x = 3", "Correct answer", "criterion", "evidence", "rationale"]
    for secret in [*private, "transcription", "confidence", "checked"]:
        assert secret not in response.text


def test_wrong_student_codes_are_capped_for_each_link():
    db = fake_store()
    db.member.side_effect = HTTPException(403, "Check your student code with your tutor.")
    other = str(uuid4())
    with client_with(db) as client:
        for _ in range(10):
            response = client.post(
                f"/api/v1/student/assignments/{TOKEN}/result", json={"student_code": "red-fox"}
            )
            assert response.status_code == 403
        for action in ["open", "result"]:
            blocked = client.post(
                f"/api/v1/student/assignments/{TOKEN}/{action}", json={"student_code": "red-fox"}
            )
            assert blocked.status_code == 429 and "15 minutes" in blocked.json()["detail"]
        submit = client.post(
            f"/api/v1/student/assignments/{TOKEN}/submit",
            data={"student_code": "red-fox", "submission_id": SUBMISSION, "drawing": "{}"},
        )
        assert submit.status_code == 429
        db.member.side_effect = None
        # A correct code on the same link waits too; other links are unaffected.
        assert (
            client.post(
                f"/api/v1/student/assignments/{TOKEN}/result", json={"student_code": "blue-otter"}
            ).status_code
            == 429
        )
        assert (
            client.post(
                f"/api/v1/student/assignments/{other}/result", json={"student_code": "blue-otter"}
            ).status_code
            == 200
        )


def test_wrong_codes_at_submission_count_towards_the_cap():
    db = fake_store()
    db.submit.side_effect = HTTPException(409, "Check your student code with your tutor.")
    with client_with(db) as client:
        for _ in range(10):
            response = client.post(
                f"/api/v1/student/assignments/{TOKEN}/submit",
                data={
                    "student_code": "red-fox",
                    "submission_id": SUBMISSION,
                    "drawing": json.dumps(DRAWING),
                },
            )
            assert response.status_code == 409
        blocked = client.post(
            f"/api/v1/student/assignments/{TOKEN}/open", json={"student_code": "red-fox"}
        )
        assert blocked.status_code == 429
