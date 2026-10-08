"""Performance analytics from tutor-approved, released results (UC8 rule 3). Drafts never count."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.question import BankQuestion
from app.services.assignments import AssignmentStore

GAP = 60  # A topic below this percentage is a learning gap.
BINS = ["0–19%", "20–39%", "40–59%", "60–79%", "80–100%"]


class InsightsStore(AssignmentStore):
    async def rows(self, path: str, params: dict):
        rows = []
        for offset in range(0, 100000, 1000):
            batch = await self.request(
                "GET", path, params={**params, "offset": offset, "limit": 1000}
            )
            rows.extend(batch)
            if len(batch) < 1000:
                return rows
        raise HTTPException(503, "Too much data to analyse. Please contact your administrator.")

    async def load(self, tutor_id: str):
        # The secret key bypasses RLS, so every query is scoped to the verified tutor.
        assignments = await self.rows(
            "/rest/v1/assignments",
            {
                "tutor_id": "eq." + tutor_id,
                "status": "in.(published,closed)",
                "select": (
                    "id,class_id,due_at,published_at,classes(name),papers(title,questions_snapshot)"
                ),
                "order": "id",
            },
        )
        students = await self.rows(
            "/rest/v1/students",
            {
                "tutor_id": "eq." + tutor_id,
                "select": "id,class_id,name,student_code,is_active",
                "order": "created_at,id",
            },
        )
        submissions = await self.rows(
            "/rest/v1/submissions",
            {
                "assignments.tutor_id": "eq." + tutor_id,
                "select": (
                    "id,assignment_id,student_id,submitted_at,assignments!inner(tutor_id),"
                    "grading_jobs(status),results(review)"
                ),
                "order": "id",
            },
        )
        return assignments, students, submissions


def parse(value: str | None):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def percent(tally) -> float | None:
    return round(100 * tally[0] / tally[1], 1) if tally[1] else None


def questions(paper: dict | None):
    """Question id -> (number, bank question, rubric points keyed by (part id, point id))."""
    found = {}
    for number, raw in enumerate((paper or {}).get("questions_snapshot") or [], 1):
        try:
            bank = BankQuestion.model_validate(raw["bankQuestion"])
        except (KeyError, TypeError, ValidationError):
            continue  # Older sample papers have no structured rubric to analyse.
        points = {
            (part.part_id, point.id): point
            for part in bank.marking_rubric.parts
            for point in part.marking_points
        }
        found[raw["id"]] = (number, bank, points)
    return found


def excerpt(bank: BankQuestion) -> str:
    content = bank.question_content
    for block in [*content.shared_blocks, *(b for part in content.parts for b in part.blocks)]:
        if block.type == "text" and block.text.strip():
            text = " ".join(block.text.split())
            return text if len(text) <= 110 else text[:107].rstrip() + "..."
    return "Question"


def kind(code: str) -> str:
    # M marks reward method; A and B marks reward correct answers and results.
    return "method" if code.strip().upper().startswith("M") else "answer"


def one(submission: dict, relation: str) -> dict:
    row = submission.get(relation) or {}
    return (row[0] if row else {}) if isinstance(row, list) else row


def job_of(submission: dict) -> dict:
    return one(submission, "grading_jobs")


def released_review(submission: dict) -> dict:
    # A reopened result still counts as last released until the tutor releases it again.
    return one(submission, "results").get("review") or {}


def build_insights(assignments, students, submissions, class_id=None, days=None, now=None):
    now = now or datetime.now(UTC)
    since = now - timedelta(days=days) if days else None
    class_names = {
        item["class_id"]: (item.get("classes") or {}).get("name", "Class") for item in assignments
    }
    chosen = sorted(
        (
            item
            for item in assignments
            if (not class_id or item["class_id"] == class_id)
            and (
                not since or (parse(item["due_at"]) or parse(item["published_at"]) or now) >= since
            )
        ),
        key=lambda item: (item["due_at"] or item["published_at"] or "", item["id"]),
    )
    papers = {item["id"]: questions(item.get("papers")) for item in chosen}
    roster = defaultdict(list)
    for student in students:
        roster[student["class_id"]].append(student)
    people = {student["id"]: student for student in students}
    work = defaultdict(list)
    for submission in submissions:
        if submission["assignment_id"] in papers:
            work[submission["assignment_id"]].append(submission)

    overall, marks = [0, 0], {"method": [0, 0], "answer": [0, 0]}
    topics = defaultdict(lambda: {"tally": [0, 0], "students": set()})
    mistakes, learners = {}, {}
    slips = {"count": 0, "parts": 0}
    checked_parts = total_parts = 0
    status, trend, distribution = [], [], [0] * len(BINS)

    def learner(student_id, assignment):
        if student_id not in learners:
            person = people.get(student_id, {})
            learners[student_id] = {
                "id": student_id,
                "name": person.get("name"),
                "code": person.get("student_code", ""),
                "class_name": class_names.get(
                    person.get("class_id"), assignment["classes"]["name"]
                ),
                "active": person.get("is_active", False),
                "submitted": 0,
                "reviewed": 0,
                "tally": [0, 0],
                "method": [0, 0],
                "answer": [0, 0],
                "topics": defaultdict(lambda: [0, 0]),
                "history": [],
            }
        return learners[student_id]

    for assignment in chosen:
        paper = papers[assignment["id"]]
        part_count = sum(len(bank.marking_rubric.parts) for _, bank, _ in paper.values())
        active = [s for s in roster[assignment["class_id"]] if s["is_active"]]
        for student in active:
            learner(student["id"], assignment)
        counts = dict(
            submitted=0, awaiting_grading=0, processing=0, awaiting_review=0, failed=0, reviewed=0,
        )
        assignment_tally = [0, 0]
        for submission in work[assignment["id"]]:
            job = job_of(submission)
            person = learner(submission["student_id"], assignment)
            person["submitted"] += 1
            if people.get(submission["student_id"], {}).get("is_active"):
                counts["submitted"] += 1
            total_parts += part_count
            score, checked = [0, 0], 0
            for reviewed_question in released_review(submission).get("questions", []):
                found = paper.get(reviewed_question.get("question_id"))
                if not found:
                    continue
                number, bank, points = found
                for part in reviewed_question.get("parts", []):
                    if not part.get("checked"):
                        continue  # Released reviews are fully checked; guard older rows anyway.
                    checked += 1
                    part_marks = {"method": [0, 0], "answer": [0, 0]}
                    for decision in part.get("points", []):
                        point = points.get((part.get("part_id"), decision.get("point_id")))
                        awarded = decision.get("awarded")
                        if point is None or type(awarded) is not int:
                            continue
                        awarded = max(0, min(awarded, point.max_marks))
                        tallies = [
                            score,
                            part_marks[kind(point.code)],
                            person["tally"],
                            person[kind(point.code)],
                        ]
                        for topic in bank.topics:
                            tallies += [topics[topic]["tally"], person["topics"][topic]]
                            topics[topic]["students"].add(submission["student_id"])
                        for tally in tallies:
                            tally[0] += awarded
                            tally[1] += point.max_marks
                        key = f"{bank.id}:{point.id}"
                        mistake = mistakes.setdefault(
                            key,
                            {
                                "question": excerpt(bank),
                                "paper": (assignment.get("papers") or {}).get("title", ""),
                                "number": number,
                                "topics": bank.topics,
                                "code": point.code,
                                "criterion": point.criterion,
                                "missed": 0,
                                "assessed": 0,
                                "students": [],
                                "feedback": [],
                            },
                        )
                        mistake["assessed"] += 1
                        if awarded < point.max_marks:
                            mistake["missed"] += 1
                            mistake["students"].append(person["name"] or person["code"])
                            note = " ".join(str(part.get("feedback", "")).split())
                            if (
                                note
                                and note not in mistake["feedback"]
                                and len(mistake["feedback"]) < 2
                            ):
                                mistake["feedback"].append(note)
                    method, answer = part_marks["method"], part_marks["answer"]
                    if method[1] and answer[1]:
                        slips["parts"] += 1
                        if method[0] == method[1] and answer[0] < answer[1]:
                            slips["count"] += 1
                    for name in marks:
                        marks[name][0] += part_marks[name][0]
                        marks[name][1] += part_marks[name][1]
            checked_parts += checked
            overall[0] += score[0]
            overall[1] += score[1]
            assignment_tally[0] += score[0]
            assignment_tally[1] += score[1]
            complete = part_count > 0 and checked >= part_count
            state = job.get("status", "submitted")
            if complete:
                counts["reviewed"] += 1
                person["reviewed"] += 1
                result = percent(score)
                if result is not None:
                    distribution[min(int(result // 20), len(BINS) - 1)] += 1
            elif state == "submitted":
                counts["awaiting_grading"] += 1
            elif state in ("queued", "processing"):
                counts["processing"] += 1
            elif state == "failed":
                counts["failed"] += 1
            else:
                counts["awaiting_review"] += 1
            if score[1]:
                person["history"].append(
                    {
                        "assignment_id": assignment["id"],
                        "title": (assignment.get("papers") or {}).get("title", ""),
                        "date": assignment["due_at"] or assignment["published_at"],
                        "percent": percent(score),
                        "complete": complete,
                    }
                )
        title = (assignment.get("papers") or {}).get("title", "")
        status.append(
            {
                "assignment_id": assignment["id"],
                "title": title,
                "class_name": assignment["classes"]["name"],
                "due_at": assignment["due_at"],
                "students": len(active),
                "not_submitted": max(0, len(active) - counts["submitted"]),
                **counts,
            }
        )
        trend.append(
            {
                "assignment_id": assignment["id"],
                "title": title,
                "class_id": assignment["class_id"],
                "class_name": assignment["classes"]["name"],
                "date": assignment["due_at"] or assignment["published_at"],
                "average": percent(assignment_tally),
                "reviewed": counts["reviewed"],
                "submitted": len(work[assignment["id"]]),
            }
        )

    topic_rows = sorted(
        (
            {
                "topic": topic,
                "percent": percent(value["tally"]),
                "earned": value["tally"][0],
                "available": value["tally"][1],
                "students": len(value["students"]),
                "below": sum(
                    1
                    for student_id in value["students"]
                    if (percent(learners[student_id]["topics"][topic]) or 0) < GAP
                ),
            }
            for topic, value in topics.items()
        ),
        key=lambda row: (row["percent"] is None, row["percent"] or 0, row["topic"]),
    )
    class_topics = {row["topic"]: row["percent"] for row in topic_rows}
    student_rows = []
    for person in learners.values():
        topic_scores = sorted(
            (
                {
                    "topic": topic,
                    "percent": percent(tally),
                    "class_percent": class_topics.get(topic),
                }
                for topic, tally in person["topics"].items()
                if tally[1]
            ),
            key=lambda row: (row["percent"], row["topic"]),
        )
        student_rows.append(
            {
                "id": person["id"],
                "name": person["name"],
                "code": person["code"],
                "class_name": person["class_name"],
                "active": person["active"],
                "submitted": person["submitted"],
                "reviewed": person["reviewed"],
                "average": percent(person["tally"]),
                "method_rate": percent(person["method"]),
                "answer_rate": percent(person["answer"]),
                "topics": topic_scores,
                "gaps": [row["topic"] for row in topic_scores if row["percent"] < GAP][:3],
                "history": person["history"],
            }
        )
    student_rows.sort(
        key=lambda row: (row["average"] is None, row["average"] or 0, row["name"] or row["code"])
    )
    mistake_rows = sorted(
        (
            {
                **row,
                "rate": round(100 * row["missed"] / row["assessed"], 1),
                "students": row["students"][:6],
            }
            for row in mistakes.values()
            if row["missed"]
        ),
        key=lambda row: (-row["missed"], -row["rate"], row["code"]),
    )[:8]
    in_scope = {s["id"] for item in chosen for s in roster[item["class_id"]] if s["is_active"]}
    return {
        "classes": sorted(
            ({"id": key, "name": name} for key, name in class_names.items()),
            key=lambda row: row["name"],
        ),
        "summary": {
            "assignments": len(chosen),
            "students": len(in_scope),
            "submissions": sum(len(work[item["id"]]) for item in chosen),
            "reviewed": sum(row["reviewed"] for row in status),
            "checked_parts": checked_parts,
            "total_parts": total_parts,
            "average": percent(overall),
            "method_rate": percent(marks["method"]),
            "answer_rate": percent(marks["answer"]),
            "slips": {**slips, "percent": percent([slips["count"], slips["parts"]])},
        },
        "status": status,
        "trend": trend,
        "distribution": [
            {"label": label, "count": count}
            for label, count in zip(BINS, distribution, strict=True)
        ],
        "topics": topic_rows,
        "mistakes": mistake_rows,
        "students": student_rows,
    }
