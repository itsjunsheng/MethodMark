"""Verify a tutor through Supabase Auth; students have no Auth accounts."""

from uuid import UUID

import httpx
from fastapi import HTTPException

from app.core.config import Settings


async def verify_tutor(settings: Settings, client: httpx.AsyncClient, token: str) -> str:
    secret = settings.supabase_secret_key.get_secret_value()
    if not settings.supabase_url or not secret:
        raise HTTPException(status_code=503, detail="Tutor login is not configured.")
    headers = {"apikey": secret, "Authorization": f"Bearer {token}"}
    base = settings.supabase_url.rstrip("/")
    try:
        response = await client.get(f"{base}/auth/v1/user", headers=headers)
        if response.status_code in {400, 401, 403}:
            raise HTTPException(status_code=401, detail="Please log in again.")
        response.raise_for_status()
        user = response.json()
        if not isinstance(user, dict):
            raise ValueError("Invalid authentication response")
        if user.get("is_anonymous") or not user.get("email_confirmed_at"):
            raise HTTPException(status_code=403, detail="A confirmed tutor account is required.")
        return str(UUID(user["id"]))
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
        # Do not forward provider responses, credentials, or account details.
        raise HTTPException(
            status_code=503, detail="Login verification is unavailable. Try again."
        ) from None
