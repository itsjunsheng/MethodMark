"""Authenticated access to the local sample-paper question bank."""

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.dependencies import get_settings, require_tutor
from app.core.config import Settings
from app.schemas.question import BankQuestion
from app.services.question_bank import QuestionBankError, fetch_questions

router = APIRouter(prefix="/sample-paper", tags=["sample paper"])


@router.get("/questions", response_model=list[BankQuestion], dependencies=[Depends(require_tutor)])
async def list_sample_questions(
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[BankQuestion]:
    # Keep the all-status sample bank local; production should serve approved questions only.
    if settings.environment != "development":
        raise HTTPException(
            status_code=403, detail="Sample paper access is available locally only."
        )
    response.headers["Cache-Control"] = "no-store"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            return await fetch_questions(settings, client)
    except QuestionBankError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
