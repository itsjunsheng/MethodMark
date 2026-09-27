"""Versioned API router; register future feature routers here."""

from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.questions import router as questions_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(questions_router)
