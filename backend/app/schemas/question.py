"""Question-bank response contract, preserving parts, diagrams and marking points."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TextBlock(BaseModel):
    type: Literal["text"]
    text: str


class DiagramBlock(BaseModel):
    type: Literal["diagram"]
    format: Literal["svg"]
    source: str
    alt_text: str


ContentBlock = Annotated[TextBlock | DiagramBlock, Field(discriminator="type")]


class QuestionPart(BaseModel):
    id: str
    label: str | None
    blocks: list[ContentBlock]


class QuestionContent(BaseModel):
    shared_blocks: list[ContentBlock]
    parts: list[QuestionPart] = Field(min_length=1)


class SolutionPart(BaseModel):
    part_id: str
    worked_solution: list[str]


class Solution(BaseModel):
    parts: list[SolutionPart]


class MarkingPoint(BaseModel):
    id: str
    code: str
    max_marks: int = Field(ge=0)
    criterion: str


class RubricPart(BaseModel):
    part_id: str
    marking_points: list[MarkingPoint]


class MarkingRubric(BaseModel):
    parts: list[RubricPart]


class BankQuestion(BaseModel):
    id: UUID
    subject: str
    school_year: int
    subject_level: Literal["G1", "G2", "G3"]
    topics: list[str]
    difficulty: Literal["easy", "medium", "hard"]
    question_content: QuestionContent
    solution: Solution
    marking_rubric: MarkingRubric
