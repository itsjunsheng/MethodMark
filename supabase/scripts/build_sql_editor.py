"""Build the SQL Editor bootstrap from the migration and demo seed sources."""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "20260927000100_initial_methodmark_schema.sql"
SEED = ROOT / "seed.sql"
OUTPUT = ROOT / "setup.sql"


def transaction_body(path: Path) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    begins = [i for i, line in enumerate(lines) if line.strip().lower() == "begin;"]
    commits = [i for i, line in enumerate(lines) if line.strip().lower() == "commit;"]
    if len(begins) != 1 or len(commits) != 1 or begins[0] >= commits[0]:
        raise ValueError(f"{path.name} must contain one outer BEGIN/COMMIT pair")
    return "\n".join(
        line for i, line in enumerate(lines) if i not in {begins[0], commits[0]}
    ).strip()


def build() -> str:
    header = """-- MethodMark: copy this ENTIRE file into Supabase SQL Editor and run once.
-- Fresh project only. Creates 3 tables, 5 demo questions and 2 demo papers.
-- Change methodmark.seed_tutor_email below to your tutor Auth email if desired.
-- A demo tutor profile is not a login account; passwords belong to Supabase Auth.
-- If you already ran the earlier full setup, do not run this bootstrap again.
-- Regenerate this file with: python supabase/scripts/build_sql_editor.py
-- Sources: migrations/20260927000100_initial_methodmark_schema.sql + seed.sql

begin;

"""
    checks = """
-- Expected on a fresh project: 5 questions and 2 papers.
-- Tutor count includes any existing email-based Auth accounts.
select
    (select count(*) from public.tutors) as tutors,
    (select count(*) from public.questions) as questions,
    (select count(*) from public.papers) as papers;

select id, title, status, question_count, share_token
from public.papers
order by title;

-- Student-safe preview; no login, solutions or marking criteria.
select public.get_student_paper(share_token) as student_preview
from public.papers
where id = '20000000-0000-4000-8000-000000000002';
"""
    return (
        header
        + transaction_body(MIGRATION)
        + "\n\n-- DEMO SEED DATA\n\n"
        + transaction_body(SEED)
        + "\n\ncommit;\n"
        + checks
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check for a stale generated SQL file")
    args = parser.parse_args()
    expected = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            parser.exit(1, "setup.sql is stale; run this script without --check.\n")
        print("setup.sql matches the migration and seed.")
    else:
        OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
        print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()

