"""Read-only, offline probes accompanying Question_Generation_Review.md.

Run from the repository root:
    question_generation/.venv/Scripts/python.exe docs/review_question_generation.py

This prints observed behavior. It makes no model calls or database connections,
does not write generated items, and does not assert that known defects are correct.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "question_generation" / "src"))

    from question_generation.domain import Solve, SolvePart
    from question_generation.mathematics import equivalent
    from question_generation.programs import compile_item
    from question_generation.storage import fingerprint
    from question_generation.verification import check_solve

    findings = {}
    item = compile_item("algebra_expansion", 19)
    p = dict(item.parameters)
    unchanged = f"({p['a']}*x+{p['b']})*(x-{p['c']})+({p['sign']})*{p['e']}*(x-1)"
    findings["unexpanded_expression"] = {
        "prompt": item.parts[0].prompt,
        "submitted": unchanged,
        "accepted": equivalent(item.parts[0].answer, unchanged),
        "desired": "Reject because the answer has not been expanded and simplified.",
    }

    item = compile_item("algebra_fractions", 19)
    p = dict(item.parameters)
    unchanged = f"{p['a']}/(x+{p['b']})+({p['sign']})*{p['c']}/(x+{p['h']})"
    findings["uncombined_fractions"] = {
        "prompt": item.parts[0].prompt,
        "submitted": unchanged,
        "accepted": equivalent(item.parts[0].answer, unchanged),
        "desired": "Reject because two fractions have not been combined into one.",
    }

    item = compile_item("right_triangle", 19)
    findings["simplest_fraction"] = {
        "prompt": item.parts[-1].prompt,
        "decimal_accepted": equivalent(item.parts[-1].answer, "0.6"),
        "unreduced_fraction_accepted": equivalent(item.parts[-1].answer, "6/10"),
        "desired": "Require the requested reduced fraction, here 3/5.",
    }
    answers = tuple(
        SolvePart(
            part=part.id,
            answer=part.answer.value,
            method=next(
                (
                    method
                    for criterion in item.criteria
                    if criterion.part == part.id
                    for method in criterion.permitted_methods
                ),
                "result",
            ),
            working="This is unrelated working with no mathematical derivation.",
        )
        for part in item.parts
    )
    solve = Solve(answers=answers, ambiguities=())
    findings["meaningless_working"] = {
        "issues": check_solve(item, solve),
        "scope": "Tests the deterministic solve gate; the final model reviewer is separate.",
        "desired": "Correct answers with unrelated working must not count as verified reasoning.",
    }
    trig_solve = solve.model_copy(
        update={
            "answers": tuple(
                answer.model_copy(
                    update={
                        "method": "trigonometry",
                        "working": "Use sin ABC = AC/BC and altitude = AB times sin ABC.",
                    }
                )
                if answer.part == "b"
                else answer
                for answer in answers
            )
        }
    )
    findings["valid_alternative_altitude_method"] = {
        "issues": check_solve(item, trig_solve),
        "desired": "Accept valid trigonometry when the prompt does not require an area method.",
    }
    findings["right_triangle_diversity"] = {
        "compiled": 900,
        "unique_instances": len(
            {
                compile_item("right_triangle", seed, variant).mathematical_identity
                for seed in range(300)
                for variant in range(3)
            }
        ),
        "constructor_capacity": "Three fixed triples times seven integer scales = 21.",
    }
    first = compile_item("similar_triangles", 19, 0)
    second = compile_item("similar_triangles", 19, 2)
    findings["similarity_variants"] = {
        "same_student_view": first.student_view() == second.student_view(),
        "same_mathematical_identity": first.mathematical_identity == second.mathematical_identity,
    }
    print(json.dumps({"fingerprint": fingerprint(), "findings": findings}, indent=2))


if __name__ == "__main__":
    main()
