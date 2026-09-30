"""Dependencies shared by API routes."""

from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings
from app.services.tutor_auth import verify_tutor


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


async def require_tutor(
    settings: Annotated[Settings, Depends(get_settings)],
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))
    ],
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    async with httpx.AsyncClient(timeout=10.0) as client:
        return await verify_tutor(settings, client, credentials.credentials)
