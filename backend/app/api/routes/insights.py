"""Tutor performance analytics. Only parts the tutor has checked are counted."""

from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import get_settings, require_tutor
from app.core.config import Settings
from app.services.insights import InsightsStore, build_insights

router = APIRouter(prefix="/insights", tags=["Insights"])


async def store(settings: Annotated[Settings, Depends(get_settings)]):
    async with httpx.AsyncClient(timeout=30) as client:
        yield InsightsStore(settings, client)


@router.get("")
async def insights(
    response: Response,
    db: Annotated[InsightsStore, Depends(store)],
    tutor: Annotated[str, Depends(require_tutor)],
    class_id: UUID | None = None,
    days: Annotated[int | None, Query(ge=1, le=3650)] = None,
):
    response.headers["Cache-Control"] = "no-store"
    assignments, students, submissions = await db.load(tutor)
    return build_insights(
        assignments, students, submissions, str(class_id) if class_id else None, days
    )
