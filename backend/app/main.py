"""Application factory and ASGI entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build an isolated application instance with validated configuration."""
    settings = settings if settings is not None else Settings()
    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "MethodMark application health and local sample-paper question bank. "
            "Tutor access uses Supabase Auth. "
            "Account-free student paper access and submission storage."
        ),
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    application.state.settings = settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
