import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.tutor_auth import verify_tutor

USER_ID = "20000000-0000-4000-8000-000000000001"


def verify(handler):
    async def run():
        config = Settings(
            _env_file=None,
            supabase_url="https://test.supabase.co",
            supabase_secret_key="sb_secret_test",
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await verify_tutor(config, client, "test-access-token")

    return asyncio.run(run())


def test_requires_authentication_before_reading_questions(monkeypatch):
    fetch = AsyncMock()
    monkeypatch.setattr("app.api.routes.questions.fetch_questions", fetch)
    with TestClient(create_app(Settings(_env_file=None))) as client:
        assert client.get("/api/v1/sample-paper/questions").status_code == 401
    fetch.assert_not_awaited()


def test_verified_auth_user_is_the_tutor():
    requests = []

    def handle(request):
        requests.append(request)
        assert request.url.path == "/auth/v1/user"
        assert request.headers["Authorization"] == "Bearer test-access-token"
        return httpx.Response(200, json={"id": USER_ID, "email_confirmed_at": "2026-09-29"})

    assert verify(handle) == USER_ID
    assert len(requests) == 1


@pytest.mark.parametrize("status", [400, 401, 403])
def test_rejects_invalid_and_expired_tokens(status):
    with pytest.raises(HTTPException) as error:
        verify(lambda request: httpx.Response(status, text="private upstream details"))
    assert error.value.status_code == 401
    assert "private" not in error.value.detail


@pytest.mark.parametrize(
    "user",
    [
        {"id": "invalid-id", "email_confirmed_at": "2026-09-29"},
        {"email_confirmed_at": "2026-09-29"},
        [],
    ],
)
def test_rejects_malformed_auth_responses(user):
    with pytest.raises(HTTPException) as error:
        verify(lambda request: httpx.Response(200, json=user))
    assert error.value.status_code == 503


@pytest.mark.parametrize(
    "user",
    [
        {"id": USER_ID},
        {"id": USER_ID, "is_anonymous": True, "email_confirmed_at": "2026-09-29"},
    ],
)
def test_rejects_unconfirmed_and_anonymous_users(user):
    with pytest.raises(HTTPException) as error:
        verify(lambda request: httpx.Response(200, json=user))
    assert error.value.status_code == 403


def test_verification_failure_is_closed_and_hides_upstream_details():
    with pytest.raises(HTTPException) as error:
        verify(lambda request: httpx.Response(500, text="sb_secret_private"))
    assert error.value.status_code == 503
    assert "sb_secret" not in error.value.detail
