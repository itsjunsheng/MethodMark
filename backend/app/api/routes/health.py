"""Application liveness. Does not claim readiness of unimplemented services."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app import __version__
from app.api.dependencies import get_settings
from app.core.config import Settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Check application health")
async def get_health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=__version__,
        environment=settings.environment,
    )
