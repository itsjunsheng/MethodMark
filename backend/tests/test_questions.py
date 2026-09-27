import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.question_bank import QuestionBankError, fetch_questions


def settings(**overrides):
    return Settings(
        _env_file=None,
        supabase_url="https://test.supabase.co",
        supabase_secret_key="sb_secret_test_only",
        **overrides,
    )


def question(number=1):
    return {
        "id": f"10000000-0000-4000-8000-{number:012d}",
        "subject": "Mathematics",
        "school_year": 3,
        "subject_level": "G3",
        "topics": ["Algebra"],
        "difficulty": "easy",
        "question_content": {
            "shared_blocks": [],
            "parts": [
                {
                    "id": "main",
                    "label": None,
                    "blocks": [
                        {"type": "text", "text": "Solve x + 2 = 5."},
                        {
                            "type": "diagram",
                            "format": "svg",
                            "source": "<svg/>",
                            "alt_text": "Diagram",
                        },
                    ],
                }
            ],
        },
        "solution": {"parts": [{"part_id": "main", "worked_solution": ["x = 3"]}]},
        "marking_rubric": {
            "parts": [
                {
                    "part_id": "main",
                    "marking_points": [
                        {"id": "a1", "code": "A1", "max_marks": 1, "criterion": "Correct answer"},
                    ],
                }
            ]
        },
    }


def fetch_with(handler, config=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_questions(config or settings(), client)

    return asyncio.run(run())


def test_fetches_every_page_and_preserves_structured_questions():
    requests = []

    def handle(request):
        requests.append(request)
        assert request.headers["apikey"] == "sb_secret_test_only"
        assert "authorization" not in request.headers
        assert request.url.params["order"] == "id.asc"
        assert "status" not in request.url.params  # All questions for this sample.
        # A server can cap pages below the requested limit.
        return httpx.Response(200, json=[question(len(requests))] if len(requests) <= 5 else [])

    result = fetch_with(handle)
    assert len(result) == 5
    assert len(requests) == 6
    assert requests[1].url.params["id"] == f"gt.{result[0].id}"
    assert result[0].model_dump(mode="json") == question()


def test_empty_bank_is_not_replaced_with_samples():
    assert fetch_with(lambda request: httpx.Response(200, json=[])) == []


@pytest.mark.parametrize("status", [401, 403, 500])
def test_upstream_errors_do_not_expose_secrets(status):
    with pytest.raises(QuestionBankError) as error:
        fetch_with(lambda request: httpx.Response(status, text="sb_secret_do_not_expose"))
    assert error.value.status_code == 502
    assert "sb_secret" not in str(error.value)


def test_timeout_returns_actionable_error():
    def handle(request):
        raise httpx.ReadTimeout("private upstream details", request=request)

    with pytest.raises(QuestionBankError, match="too long"):
        fetch_with(handle)


def test_invalid_question_fails_instead_of_dropping_content():
    invalid = deepcopy(question())
    invalid["question_content"]["parts"][0]["blocks"][1]["format"] = "javascript"
    with pytest.raises(QuestionBankError, match="unsupported question format"):
        fetch_with(lambda request: httpx.Response(200, json=[invalid]))


def test_missing_configuration_does_not_contact_supabase():
    def handle(request):
        pytest.fail("No upstream request should be made")

    config = settings()
    config.supabase_url = ""
    with pytest.raises(QuestionBankError) as error:
        fetch_with(handle, config)
    assert error.value.status_code == 503


@pytest.mark.parametrize("environment", ["production", "test"])
def test_sample_endpoint_is_disabled_outside_development(environment, monkeypatch):
    fetch = AsyncMock()
    monkeypatch.setattr("app.api.routes.questions.fetch_questions", fetch)
    with TestClient(create_app(settings(environment=environment))) as client:
        response = client.get("/api/v1/sample-paper/questions")
    assert response.status_code == 403
    fetch.assert_not_awaited()


def test_sample_endpoint_returns_validated_questions_without_caching(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.questions.fetch_questions", AsyncMock(return_value=[question()])
    )
    with TestClient(create_app(settings(environment="development"))) as client:
        response = client.get("/api/v1/sample-paper/questions")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == [question()]


def test_sample_endpoint_translates_service_errors(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.questions.fetch_questions",
        AsyncMock(
            side_effect=QuestionBankError("Not configured", status_code=503),
        ),
    )
    with TestClient(create_app(settings(environment="development"))) as client:
        response = client.get("/api/v1/sample-paper/questions")
    assert response.status_code == 503
    assert response.json() == {"detail": "Not configured"}
