"""Versioned API router; register future feature routers here."""

from fastapi import APIRouter

from app.api.routes.assignments import router as assignments_router
from app.api.routes.grading import router as grading_router
from app.api.routes.health import router as health_router
from app.api.routes.insights import router as insights_router
from app.api.routes.questions import router as questions_router
from app.api.routes.student_assignments import router as student_assignments_router

api_router = APIRouter()
api_router.include_router(assignments_router)
api_router.include_router(health_router)
api_router.include_router(grading_router)
api_router.include_router(insights_router)
api_router.include_router(questions_router)
api_router.include_router(student_assignments_router)
