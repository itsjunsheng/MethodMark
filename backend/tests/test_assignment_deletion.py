import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from test_questions import settings

from app.api.dependencies import require_tutor
from app.api.routes.assignments import store
from app.main import create_app
from app.services.assignments import AssignmentStore

ASSIGNMENT, TUTOR, OTHER_TUTOR = [str(uuid4()) for _ in range(3)]


def test_delete_requires_login_and_uses_verified_tutor():
    app = create_app(settings())
    db = AsyncMock()
    app.dependency_overrides[store] = lambda: db
    with TestClient(app) as client:
        assert client.delete(f"/api/v1/assignments/{ASSIGNMENT}").status_code == 401
        db.delete_assignment.assert_not_awaited()
        app.dependency_overrides[require_tutor] = lambda: TUTOR
        assert client.delete("/api/v1/assignments/invalid").status_code == 422
        db.delete_assignment.assert_not_awaited()
        response = client.delete(
            f"/api/v1/assignments/{ASSIGNMENT}?tutor_id={OTHER_TUTOR}"
        )
        assert response.status_code == 204
        assert not response.content
        db.delete_assignment.assert_awaited_once_with(ASSIGNMENT, TUTOR)


def test_delete_never_reports_success_on_storage_failure():
    app = create_app(settings())
    db = AsyncMock()
    db.delete_assignment.side_effect = HTTPException(502, "Storage unavailable.")
    app.dependency_overrides[store] = lambda: db
    app.dependency_overrides[require_tutor] = lambda: TUTOR
    with TestClient(app) as client:
        assert client.delete(f"/api/v1/assignments/{ASSIGNMENT}").status_code == 502


def test_store_scopes_delete_atomically_and_retries_are_safe():
    rows = {ASSIGNMENT: TUTOR}

    def handler(request):
        assert request.method == "DELETE"
        assert request.url.path == "/rest/v1/assignments"
        assert request.headers["apikey"] == "sb_secret_test_only"
        assert request.headers["prefer"] == "return=minimal"
        params = request.url.params
        assert set(params) == {"id", "tutor_id"}
        target = params["id"].removeprefix("eq.")
        owner = params["tutor_id"].removeprefix("eq.")
        if rows.get(target) == owner:
            rows.pop(target)
        return httpx.Response(204)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            db = AssignmentStore(settings(), client)
            await db.delete_assignment(ASSIGNMENT, OTHER_TUTOR)
            assert rows == {ASSIGNMENT: TUTOR}
            await db.delete_assignment(ASSIGNMENT, TUTOR)
            assert not rows
            await db.delete_assignment(ASSIGNMENT, TUTOR)
            assert not rows

    asyncio.run(run())


@pytest.mark.parametrize("status", [401, 403, 500])
def test_store_does_not_swallow_database_errors(status):
    async def run():
        transport = httpx.MockTransport(lambda request: httpx.Response(status))
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(HTTPException) as error:
                await AssignmentStore(settings(), client).delete_assignment(ASSIGNMENT, TUTOR)
            assert error.value.status_code == 502

    asyncio.run(run())
