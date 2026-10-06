import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from test_questions import settings

from app.api.dependencies import require_tutor
from app.api.routes.insights import store
from app.main import create_app
from app.services.insights import InsightsStore, build_insights

CLASS, OTHER_CLASS = str(uuid4()), str(uuid4())
NOW = datetime(2026, 10, 5, tzinfo=UTC)


def bank(question_id, topics, parts):
    return {
        "id": question_id,
        "subject": "Mathematics",
        "school_year": 3,
        "subject_level": "G3",
        "topics": topics,
        "difficulty": "medium",
        "question_content": {
            "shared_blocks": [{"type": "text", "text": "Answer the question."}],
            "parts": [{"id": part, "label": None, "blocks": []} for part in parts],
        },
        "solution": {"parts": [{"part_id": part, "worked_solution": ["Step"]} for part in parts]},
        "marking_rubric": {
            "parts": [
                {
                    "part_id": part,
                    "marking_points": [
                        {"id": point, "code": point.upper(), "max_marks": 1, "criterion": point}
                        for point in points
                    ],
                }
                for part, points in parts.items()
            ]
        },
    }


QUADRATIC = str(uuid4())
PROBABILITY = str(uuid4())
PAPER = {
    "title": "Weekly practice",
    "questions_snapshot": [
        {"id": QUADRATIC, "bankQuestion": bank(QUADRATIC, ["Quadratics"], {"main": ["m1", "a1"]})},
        {
            "id": PROBABILITY,
            "bankQuestion": bank(PROBABILITY, ["Probability"], {"a": ["b1"], "b": ["b2"]}),
        },
    ],
}
ASSIGNMENT = {
    "id": str(uuid4()),
    "class_id": CLASS,
    "due_at": "2026-10-01T00:00:00Z",
    "published_at": "2026-09-24T00:00:00Z",
    "classes": {"name": "Sec 3"},
    "papers": PAPER,
}
OLD = {
    **ASSIGNMENT,
    "id": str(uuid4()),
    "class_id": OTHER_CLASS,
    "due_at": "2026-01-01T00:00:00Z",
    "classes": {"name": "Old class"},
}
STUDENTS = [
    {
        "id": "s1",
        "class_id": CLASS,
        "name": "Aisha",
        "student_code": "blue-otter",
        "is_active": True,
    },
    {"id": "s2", "class_id": CLASS, "name": None, "student_code": "red-fox", "is_active": True},
    {"id": "s3", "class_id": CLASS, "name": "Ben", "student_code": "teal-owl", "is_active": True},
    {"id": "s4", "class_id": CLASS, "name": "Chen", "student_code": "gold-cat", "is_active": True},
    {
        "id": "s5",
        "class_id": CLASS,
        "name": "Dana",
        "student_code": "pink-duck",
        "is_active": False,
    },
]


def part(part_id, points, checked=True, feedback=""):
    return {
        "part_id": part_id,
        "checked": checked,
        "feedback": feedback,
        "points": [{"point_id": key, "awarded": value} for key, value in points.items()],
    }


def submission(student, status, questions=None):
    return {
        "id": str(uuid4()),
        "assignment_id": ASSIGNMENT["id"],
        "student_id": student,
        "submitted_at": "2026-09-30T00:00:00Z",
        "grading_jobs": {
            "status": status,
            "review_draft": {"questions": questions} if questions else None,
        },
    }


SUBMISSIONS = [
    # Fully checked: method kept, answer slipped on the quadratic.
    submission(
        "s1",
        "awaiting_review",
        [
            {
                "question_id": QUADRATIC,
                "parts": [part("main", {"m1": 1, "a1": 0}, feedback="Check the second root.")],
            },
            {"question_id": PROBABILITY, "parts": [part("a", {"b1": 1}), part("b", {"b2": 1})]},
        ],
    ),
    # One checked part; the unchecked probability marks must not count.
    submission(
        "s2",
        "awaiting_review",
        [
            {"question_id": QUADRATIC, "parts": [part("main", {"m1": 0, "a1": 0})]},
            {
                "question_id": PROBABILITY,
                "parts": [part("a", {"b1": 1}, False), part("b", {"b2": 1}, False)],
            },
        ],
    ),
    submission("s3", "queued"),
    submission("s5", "failed"),
]


def test_counts_only_tutor_checked_parts():
    result = build_insights([ASSIGNMENT], STUDENTS, SUBMISSIONS, now=NOW)
    summary = result["summary"]
    assert summary["average"] == 50.0  # (1 + 0 + 1 + 1 + 0 + 0) / 6
    assert summary["checked_parts"] == 4 and summary["total_parts"] == 12
    assert summary["method_rate"] == 50.0 and summary["answer_rate"] == 50.0
    assert summary["slips"] == {"count": 1, "parts": 2, "percent": 50.0}
    assert summary["students"] == 4 and summary["submissions"] == 4 and summary["reviewed"] == 1
    status = result["status"][0]
    assert (status["submitted"], status["not_submitted"], status["reviewed"]) == (3, 1, 1)
    assert (status["awaiting_review"], status["processing"], status["failed"]) == (1, 1, 1)
    assert result["distribution"][3] == {"label": "60–79%", "count": 1}


def test_topics_mistakes_and_learning_gaps():
    result = build_insights([ASSIGNMENT], STUDENTS, SUBMISSIONS, now=NOW)
    assert [(row["topic"], row["percent"], row["below"]) for row in result["topics"]] == [
        ("Quadratics", 25.0, 2),
        ("Probability", 100.0, 0),
    ]
    first = result["mistakes"][0]
    assert (first["code"], first["missed"], first["assessed"], first["rate"]) == ("A1", 2, 2, 100.0)
    assert first["students"] == ["Aisha", "red-fox"] and first["feedback"] == [
        "Check the second root."
    ]
    students = {row["code"]: row for row in result["students"]}
    assert result["students"][0]["code"] == "red-fox"  # Lowest average first.
    assert students["blue-otter"]["average"] == 75.0 and students["blue-otter"]["gaps"] == [
        "Quadratics"
    ]
    assert students["teal-owl"]["average"] is None and students["teal-owl"]["submitted"] == 1
    assert students["gold-cat"]["submitted"] == 0
    assert students["pink-duck"]["active"] is False


def test_class_and_period_filters():
    everything = build_insights([ASSIGNMENT, OLD], STUDENTS, SUBMISSIONS, now=NOW)
    assert [row["name"] for row in everything["classes"]] == ["Old class", "Sec 3"]
    assert [row["title"] for row in everything["trend"]] == ["Weekly practice", "Weekly practice"]
    assert everything["trend"][0]["average"] is None  # The old class has no checked work.
    recent = build_insights([ASSIGNMENT, OLD], STUDENTS, SUBMISSIONS, days=30, now=NOW)
    assert recent["summary"]["assignments"] == 1
    other = build_insights([ASSIGNMENT, OLD], STUDENTS, SUBMISSIONS, class_id=OTHER_CLASS, now=NOW)
    assert other["summary"]["submissions"] == 0 and other["summary"]["average"] is None


def test_empty_workspace_has_no_sample_data():
    result = build_insights([], [], [], now=NOW)
    assert result["summary"]["average"] is None
    assert result["topics"] == result["mistakes"] == result["students"] == result["trend"] == []


def test_insights_endpoint_requires_tutor_and_passes_filters():
    db = AsyncMock(load=AsyncMock(return_value=([ASSIGNMENT], STUDENTS, SUBMISSIONS)))
    app = create_app(settings())
    app.dependency_overrides[store] = lambda: db
    with TestClient(app) as client:
        assert client.get("/api/v1/insights").status_code == 401
        app.dependency_overrides[require_tutor] = lambda: "tutor"
        response = client.get(f"/api/v1/insights?class_id={CLASS}&days=3650")
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        assert response.json()["summary"]["average"] == 50.0
        assert client.get("/api/v1/insights?days=0").status_code == 422
    db.load.assert_awaited_with("tutor")


def test_store_scopes_every_query_to_the_tutor():
    seen = []

    def handler(request):
        seen.append(request.url)
        return httpx.Response(200, json=[])

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await InsightsStore(settings(), client).load("tutor-1")

    assert asyncio.run(run()) == ([], [], [])
    assert [url.path for url in seen] == [
        "/rest/v1/assignments",
        "/rest/v1/students",
        "/rest/v1/submissions",
    ]
    assert seen[0].params["tutor_id"] == seen[1].params["tutor_id"] == "eq.tutor-1"
    assert seen[2].params["assignments.tutor_id"] == "eq.tutor-1"
