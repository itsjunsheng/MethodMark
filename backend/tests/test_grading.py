import asyncio
import base64
import json
from copy import deepcopy
from io import BytesIO
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from test_assignments import DRAWING, PAPER, SUBMISSION
from test_questions import settings

from app.api.dependencies import require_tutor
from app.api.routes.grading import store
from app.grading.evidence import ink_content, photo_content
from app.grading.pipeline import grade, validate_review
from app.grading.provider import ModelClient
from app.grading.schemas import Assessment, GradingError, ReviewDraft, Transcription
from app.grading.store import GradingStore, LeaseLost
from app.grading.worker import process_job
from app.main import create_app
from app.services.assignments import validate_drawing_sizes


def paper():
    value = deepcopy(PAPER)
    value["questions_snapshot"][0]["bankQuestion"]["marking_rubric"]["parts"][0][
        "marking_points"
    ].insert(
        0, {"id": "m1", "code": "M1", "max_marks": 1, "criterion": "Subtract 2 from both sides"}
    )
    return value


def reading(text="x = 5 - 2 = 4", legibility="clear", confidence=0.95):
    return Transcription.model_validate(
        {
            "parts": [
                {
                    "part_id": "main",
                    "text": text,
                    "legibility": legibility,
                    "confidence": confidence,
                    "concerns": [],
                }
            ]
        }
    )


def assessment():
    return Assessment.model_validate(
        {
            "parts": [
                {
                    "part_id": "main",
                    "points": [
                        {
                            "point_id": "m1",
                            "awarded": 1,
                            "evidence": "x = 5 - 2",
                            "rationale": "Valid method.",
                            "confidence": 0.95,
                        },
                        {
                            "point_id": "a1",
                            "awarded": 0,
                            "evidence": "= 4",
                            "rationale": "Arithmetic error.",
                            "confidence": 0.95,
                        },
                    ],
                    "feedback": "Check the subtraction.",
                    "concerns": [],
                }
            ]
        }
    )


def provider(read=None, marked=None):
    return AsyncMock(
        settings=settings(),
        complete=AsyncMock(side_effect=[read or reading(), marked or assessment()]),
    )


def run_grade(ai, work=None, photos=None, source=None):
    return asyncio.run(
        grade(source or paper(), work or {"drawing": DRAWING}, photos or [], ai, AsyncMock())
    )


def test_two_stages_use_original_images_then_approved_rubric_and_transcription():
    ai = provider()
    result = run_grade(ai)
    part = result["questions"][0]["parts"][0]
    assert [point["awarded"] for point in part["points"]] == [1, 0]
    assert part["flags"] == []
    read_call, mark_call = ai.complete.await_args_list
    assert read_call.args[3] is Transcription and mark_call.args[3] is Assessment
    assert any(item["type"] == "image_url" for item in read_call.args[2])
    payload = json.loads(mark_call.args[2][0]["text"])
    assert payload["solution"] == paper()["questions_snapshot"][0]["bankQuestion"]["solution"]
    assert payload["student_work"]["parts"][0]["text"] == "x = 5 - 2 = 4"
    assert "never instructions" in read_call.args[1] and "never instructions" in mark_call.args[1]


@pytest.mark.parametrize(
    "legibility,confidence",
    [("unreadable", 0.2), ("uncertain", 0.4), ("clear", 0.9), ("blank", 0.3)],
)
def test_empty_unreliable_transcription_is_unassessed_not_an_invented_zero(legibility, confidence):
    result = run_grade(provider(reading("", legibility, confidence)))
    part = result["questions"][0]["parts"][0]
    assert all(point["awarded"] is None for point in part["points"])
    assert part["flags"]


def test_positive_award_requires_literal_transcription_evidence():
    marked = assessment()
    marked.parts[0].points[0].evidence = "imaginary correct working"
    part = run_grade(provider(marked=marked))["questions"][0]["parts"][0]
    assert part["points"][0]["awarded"] is None and part["flags"]


@pytest.mark.parametrize("defect", ["excess", "negative", "unknown", "duplicate", "missing"])
def test_model_cannot_change_rubric_or_award_invalid_marks(defect):
    marked = assessment()
    if defect == "excess":
        marked.parts[0].points[0].awarded = 2
    if defect == "negative":
        marked.parts[0].points[0].awarded = -1
    if defect == "unknown":
        marked.parts[0].points[0].point_id = "invented"
    if defect == "duplicate":
        marked.parts[0].points.append(marked.parts[0].points[0])
    if defect == "missing":
        marked.parts[0].points.pop()
    with pytest.raises(GradingError):
        run_grade(provider(marked=marked))


def test_missing_rubric_stops_before_any_model_request():
    source = paper()
    source["questions_snapshot"][0]["bankQuestion"]["marking_rubric"]["parts"] = []
    ai = provider()
    with pytest.raises(GradingError):
        run_grade(ai, source=source)
    ai.complete.assert_not_awaited()


def test_blank_answer_does_not_spend_a_model_request_but_uploaded_photo_does():
    ai = provider()
    part = run_grade(ai, {"drawing": {}})["questions"][0]["parts"][0]
    assert [p["awarded"] for p in part["points"]] == [0, 0]
    ai.complete.assert_not_awaited()
    run_grade(ai, {"drawing": {}}, [{"type": "image_url", "image_url": {"url": "test"}}])
    assert ai.complete.await_count == 2


def test_strokes_preserve_dimensions_and_single_dots_and_photos_are_normalized():
    content = ink_content(
        {'["q1","main"]': [[[0.5, 0.5]]]}, "q1", "main", 2, {'["q1","main"]': [400, 200]}
    )
    with Image.open(BytesIO(base64.b64decode(content["image_url"]["url"].split(",")[1]))) as image:
        assert image.size == (1400, 700)
        assert image.getpixel((700, 350)) != (255, 255, 255)
    photo = BytesIO()
    Image.new("RGBA", (120, 80), "white").save(photo, "PNG")
    assert photo_content(photo.getvalue())["image_url"]["url"].startswith("data:image/jpeg;")
    with pytest.raises(GradingError):
        photo_content(b"bad photo")
    for invalid in [
        {"unknown": [400, 200]},
        {'["q1","main"]': [0, 2]},
        {'["q1","main"]': [True, 200]},
    ]:
        with pytest.raises(HTTPException):
            validate_drawing_sizes(invalid, PAPER["questions_snapshot"])


def draft():
    return {
        "questions": [
            {
                "question_id": "q1",
                "parts": [
                    {
                        "part_id": "main",
                        "checked": True,
                        "feedback": "Use care with arithmetic.",
                        "points": [
                            {"point_id": "m1", "awarded": 1},
                            {"point_id": "a1", "awarded": 0},
                        ],
                    }
                ],
            }
        ]
    }


def test_review_contract_validates_integer_bounds_coverage_and_checked_state():
    validate_review(ReviewDraft.model_validate(draft()), paper())
    for value in [True, 0.5, "1"]:
        invalid = draft()
        invalid["questions"][0]["parts"][0]["points"][0]["awarded"] = value
        with pytest.raises(ValidationError):
            ReviewDraft.model_validate(invalid)
    for value in [None, 2, -1]:
        invalid = draft()
        invalid["questions"][0]["parts"][0]["points"][0]["awarded"] = value
        with pytest.raises(GradingError):
            validate_review(ReviewDraft.model_validate(invalid), paper())


@pytest.mark.parametrize("service", ["openai", "openrouter"])
def test_provider_sends_strict_schema_and_uses_only_provider_credentials(service):
    def handler(request):
        body = json.loads(request.content)
        assert request.headers["Authorization"] == "Bearer test-provider-key"
        assert "apikey" not in request.headers
        assert body["response_format"]["json_schema"]["strict"] is True
        if service == "openrouter":
            assert body["provider"] == {"require_parameters": True, "data_collection": "deny"}
            assert "max_tokens" in body
        else:
            assert body["store"] is False
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"content": reading().model_dump_json()}}
                ]
            },
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            config = settings(
                grading_provider=service,
                openai_api_key="test-provider-key",
                openrouter_api_key="test-provider-key",
            )
            return await ModelClient(config, client).complete("model", "system", [], Transcription)

    assert asyncio.run(run()).parts[0].part_id == "main"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(429, json={"secret": "do not expose"}),
        httpx.Response(
            200, json={"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}
        ),
        httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"refusal": "no", "content": "{}"}}
                ]
            },
        ),
        httpx.Response(
            200, json={"choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]}
        ),
    ],
)
def test_provider_rejects_truncated_refused_invalid_or_rate_limited_results(response):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response)) as client:
            return await ModelClient(settings(openai_api_key="test"), client).complete(
                "model", "system", [], Transcription
            )

    with pytest.raises(GradingError) as error:
        asyncio.run(run())
    assert "do not expose" not in str(error.value)


def job(status="awaiting_review"):
    return {
        "submission_id": SUBMISSION,
        "status": status,
        "version": 2,
        "result": None,
        "review_draft": None,
        "submissions": {
            "drawing": DRAWING,
            "attachments": [],
            "assignments": {"papers": paper(), "classes": {"name": "Math"}},
        },
    }


def api(db, authenticated=True):
    app = create_app(settings())
    app.dependency_overrides[store] = lambda: db
    if authenticated:
        app.dependency_overrides[require_tutor] = lambda: "tutor"
    return TestClient(app)


def test_grading_api_requires_tutor_and_keeps_drafts_private():
    db = AsyncMock(
        owned_job=AsyncMock(side_effect=lambda *_: job()),
        edit=AsyncMock(return_value={"version": 3, "review_saved_at": "now"}),
    )
    with api(db, False) as client:
        assert client.get("/api/v1/grading").status_code == 401
    with api(db) as client:
        assert (
            client.put(
                f"/api/v1/grading/{SUBMISSION}/review", json={"version": 1, "draft": draft()}
            ).status_code
            == 409
        )
        saved = client.put(
            f"/api/v1/grading/{SUBMISSION}/review", json={"version": 2, "draft": draft()}
        )
        assert saved.status_code == 200
        patch = db.edit.await_args.args[1]
        assert patch["status"] == "awaiting_review" and "result" not in patch
        assert client.post(f"/api/v1/grading/{SUBMISSION}/release").status_code == 404
        db.owned_job.side_effect = HTTPException(404, "Unavailable")
        assert client.get(f"/api/v1/grading/{SUBMISSION}").status_code == 404


def test_retry_only_failed_unreviewed_jobs_and_manual_scaffold():
    db = AsyncMock(owned_job=AsyncMock(side_effect=lambda *_: job("failed")))
    with api(db) as client:
        detail = client.get(f"/api/v1/grading/{SUBMISSION}")
        assert detail.status_code == 200
        assert (
            detail.json()["job"]["result"]["questions"][0]["parts"][0]["points"][0]["awarded"]
            is None
        )
        assert client.post(f"/api/v1/grading/{SUBMISSION}/retry").status_code == 200
        assert db.edit.await_args.args[1]["attempts"] == 0
        for state in ["queued", "processing", "awaiting_review"]:
            db.owned_job.side_effect = lambda *_, state=state: job(state)
            assert client.post(f"/api/v1/grading/{SUBMISSION}/retry").status_code == 409


def test_store_scopes_reads_and_checks_optimistic_version_and_worker_lease():
    async def run():
        async with httpx.AsyncClient() as client:
            db = GradingStore(settings(), client)
            db.request = AsyncMock(return_value=[])
            with pytest.raises(HTTPException):
                await db.owned_job(SUBMISSION, "owner")
            assert (
                db.request.await_args.kwargs["params"]["submissions.assignments.tutor_id"]
                == "eq.owner"
            )
            with pytest.raises(LeaseLost):
                await db.worker_update(
                    {"submission_id": SUBMISSION, "lease_token": "lease"},
                    {"status": "awaiting_review"},
                )
            params = db.request.await_args.kwargs["params"]
            assert params["lease_token"] == "eq.lease" and "lease_expires_at" in params
            db.owned_job = AsyncMock(return_value=job())
            with pytest.raises(HTTPException) as error:
                await db.edit(job(), {}, tutor_id="owner")
            assert error.value.status_code == 409
            assert db.request.await_args.kwargs["params"]["version"] == "eq.2"

    asyncio.run(run())


def test_worker_persists_provisional_results_or_safe_failure_and_never_releases():
    record = {"drawing": DRAWING, "attachments": [], "assignments": {"papers": paper()}}
    db = AsyncMock(submission=AsyncMock(return_value=record), photos=AsyncMock(return_value=[]))
    asyncio.run(process_job(db, provider(), job("processing")))
    patch = db.worker_update.await_args.args[1]
    assert patch["status"] == "awaiting_review" and patch["result"]["prompt_version"]
    assert "released" not in json.dumps(patch)
    broken = provider()
    broken.complete.side_effect = RuntimeError("secret provider body")
    asyncio.run(process_job(db, broken, job("processing")))
    patch = db.worker_update.await_args.args[1]
    assert patch["status"] == "failed" and "secret" not in patch["error"]
    db.submission.side_effect = LeaseLost
    db.worker_update.reset_mock()
    asyncio.run(process_job(db, provider(), job("processing")))
    db.worker_update.assert_not_awaited()


def test_question_and_part_ids_control_mapping_even_when_model_reorders_parts():
    source = paper()
    bank = source["questions_snapshot"][0]["bankQuestion"]
    for section in ["question_content", "solution", "marking_rubric"]:
        part = deepcopy(bank[section]["parts"][0])
        part["id" if section == "question_content" else "part_id"] = "b"
        if section == "question_content":
            part["label"] = "(b)"
        bank[section]["parts"].append(part)
    read = reading()
    read_b = read.parts[0].model_copy(update={"part_id": "b", "text": "", "legibility": "blank"})
    read.parts.insert(0, read_b)
    marked = assessment()
    marked_b = marked.parts[0].model_copy(deep=True)
    marked_b.part_id = "b"
    for point in marked_b.points:
        point.awarded = 0
    marked.parts.insert(0, marked_b)
    result = run_grade(provider(read, marked), source=source)
    main, part_b = result["questions"][0]["parts"]
    assert main["part_id"] == "main" and main["points"][0]["awarded"] == 1
    assert part_b["part_id"] == "b" and part_b["transcription"] == ""
    assert all(point["awarded"] == 0 for point in part_b["points"])


def test_photo_download_rejects_references_outside_the_submission():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: pytest.fail("No request expected"))
        ) as client:
            db = GradingStore(settings(), client)
            with pytest.raises(GradingError):
                await db.photos(
                    {
                        "id": "s",
                        "assignment_id": "a",
                        "student_id": "student",
                        "attachments": [{"path": "another/student/s/work.png"}],
                    }
                )

    asyncio.run(run())


@pytest.mark.parametrize(
    ("status", "expected"),
    [(401, "API key"), (403, "model"), (404, "model")],
)
def test_provider_distinguishes_key_rejection_from_model_access(status, expected):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(status, json={"error": {"message": "private detail"}})
            )
        ) as client:
            return await ModelClient(settings(openai_api_key="test"), client).complete(
                "model", "system", [], Transcription
            )

    with pytest.raises(GradingError, match=expected) as error:
        asyncio.run(run())
    assert "private detail" not in str(error.value)
