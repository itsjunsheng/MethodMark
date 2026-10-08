"""Released results as students see them: tutor-approved marks and feedback only."""

from app.grading.pipeline import paper_questions
from app.services.insights import kind


def tally():
    return {"earned": 0, "available": 0}


def add(totals, earned, available):
    totals["earned"] += earned
    totals["available"] += available


def student_result(review: dict, paper: dict) -> dict:
    # Rubric criteria, worked solutions, AI evidence and transcriptions are never included.
    reviewed = {question["question_id"]: question for question in review.get("questions", [])}
    overall, by_kind, questions = tally(), {"method": tally(), "answer": tally()}, []
    for number, (question, bank) in enumerate(paper_questions(paper), 1):
        labels = {part.id: part.label for part in bank.question_content.parts}
        parts_reviewed = {
            part["part_id"]: part for part in reviewed.get(question["id"], {}).get("parts", [])
        }
        question_total, parts = tally(), []
        for rubric in bank.marking_rubric.parts:
            part = parts_reviewed.get(rubric.part_id, {})
            awards = {point["point_id"]: point.get("awarded") for point in part.get("points", [])}
            part_total, marks = tally(), []
            for point in rubric.marking_points:
                awarded = max(0, min(int(awards.get(point.id) or 0), point.max_marks))
                marks.append({"code": point.code, "awarded": awarded, "max_marks": point.max_marks})
                for totals in (part_total, question_total, overall, by_kind[kind(point.code)]):
                    add(totals, awarded, point.max_marks)
            parts.append(
                {
                    "label": labels.get(rubric.part_id),
                    **part_total,
                    "marks": marks,
                    "feedback": str(part.get("feedback", "")).strip(),
                }
            )
        questions.append({"number": number, **question_total, "parts": parts})
    return {
        **overall,
        "method": by_kind["method"],
        "accuracy": by_kind["answer"],
        "questions": questions,
    }
