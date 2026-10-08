"""Strict AI contracts and tutor review drafts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Reading(StrictModel):
    part_id: str
    text: str
    legibility: Literal["clear", "uncertain", "unreadable", "blank"]
    confidence: float = Field(ge=0, le=1)
    concerns: list[str]


class Transcription(StrictModel):
    parts: list[Reading]


class Decision(StrictModel):
    point_id: str
    awarded: StrictInt | None
    evidence: str
    rationale: str
    confidence: float = Field(ge=0, le=1)


class PartAssessment(StrictModel):
    part_id: str
    points: list[Decision]
    feedback: str
    concerns: list[str]


class Assessment(StrictModel):
    parts: list[PartAssessment]


class ReviewPoint(StrictModel):
    point_id: str
    awarded: StrictInt | None


class ReviewPart(StrictModel):
    part_id: str
    points: list[ReviewPoint]
    feedback: str = Field(max_length=4000)
    checked: bool


class ReviewQuestion(StrictModel):
    question_id: str
    parts: list[ReviewPart]


class ReviewDraft(StrictModel):
    questions: list[ReviewQuestion] = Field(max_length=200)


class SaveReview(StrictModel):
    version: int = Field(ge=0)
    draft: ReviewDraft


class ReopenResult(StrictModel):
    version: int = Field(ge=0)


class GradingError(Exception):
    """A safe message that may be shown to the tutor."""
