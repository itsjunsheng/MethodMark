"""Tutor-owned assignment management."""

from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Response

from app.api.dependencies import get_settings, require_tutor
from app.core.config import Settings
from app.services.assignments import AssignmentStore

router = APIRouter(prefix="/assignments", tags=["Assignments"])


async def store(settings: Annotated[Settings, Depends(get_settings)]):
    async with httpx.AsyncClient(timeout=30) as client:
        yield AssignmentStore(settings, client)


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: UUID,
    tutor: Annotated[str, Depends(require_tutor)],
    db: Annotated[AssignmentStore, Depends(store)],
):
    await db.delete_assignment(str(assignment_id), tutor)
    return Response(status_code=204)
