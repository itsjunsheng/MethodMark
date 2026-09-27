# MethodMark database

The database uses three application tables: `tutors`, `questions`, and `papers`.
Supabase Auth stores tutor credentials separately. Students access a published
paper by its shared token and do not register, log in, or use anonymous Auth accounts.

## Run in the hosted SQL Editor

1. Open [setup.sql](setup.sql) and copy its **entire contents** into a new query in
   your Supabase project's SQL Editor.
2. Find the `methodmark.seed_tutor_email` setting. Replace
   `demo.tutor@example.com` with your tutor's Auth email if you want the sample
   papers assigned to that account. Use the same email on later seed runs.
3. Run the query once against a fresh project. Schema and seed changes are
   committed together. The final queries show row counts, paper access tokens,
   and a student-safe preview.
4. For tutor application testing, create the matching email/password user through
   Supabase Authentication if it does not already exist. The signup trigger links
   the seeded profile to that Auth user. A row in `public.tutors` alone is not a
   login account, and there are no demo passwords in these files.

The default seed creates one tutor profile, five questions, and two papers.
Additional existing email-based Auth users get their own tutor profiles.

If you already ran the earlier full SQL script from the conversation, do not run
`setup.sql` again: the schema already exists. You can run [seed.sql](seed.sql)
against that schema. It preserves existing question content, paper snapshots,
paper IDs, access tokens, and publication statuses instead of resetting them.
Changing the demo email on a previously seeded database does not transfer ownership
of existing papers; use the original seed email for reruns.

## Files

| File | Purpose |
| --- | --- |
| `migrations/20260927000100_initial_methodmark_schema.sql` | Canonical schema, constraints, indexes, triggers, grants, RLS policies and student-access function |
| `seed.sql` | Demo profiles, questions and papers; rerunnable for the same demo tutor |
| `setup.sql` | Generated, standalone SQL Editor script combining schema and seed in one transaction |
| `scripts/build_sql_editor.py` | Regenerates or verifies the combined SQL Editor script |
| `config.toml` | Optional local Supabase CLI configuration; not needed for the hosted SQL Editor |

Use the migration and seed as source files. After changing them, run from the
repository root:

```sh
python supabase/scripts/build_sql_editor.py
python supabase/scripts/build_sql_editor.py --check
```

`setup.sql` contains ordinary PostgreSQL SQL. It does not use `psql` commands such
as `\i`, so it can be pasted directly into the hosted SQL Editor.

## Sample data

The subject/year/difficulty tags are illustrative development fixtures, not a
claim that the examples form a complete or officially mapped syllabus bank.

| Question ID suffix | Example | Year / subject level | Marks |
| --- | --- | --- | --- |
| `000001` | Solve a quadratic, one unlabelled part | Sec 3 / G3 | 2 |
| `000002` | Linear relation with parts (a) and (b) | Sec 3 / G3 | 4 |
| `000003` | Pythagoras question with SVG drawing source | Sec 2 / G3 | 2 |
| `000004` | Linear equation | Sec 2 / G2 | 2 |
| `000005` | Percentages | Sec 1 / G1 | 2 |

- **Algebra Practice:** draft paper, two questions, six marks.
- **Pythagoras Practice:** published paper, one question, two marks.

Question-bank rows have separate `question_content`, `solution`, and
`marking_rubric` JSONB columns. `papers.questions_snapshot` contains an ordered
array of copied questions and their matching solutions/rubrics. Each item has a
stable `paper_question_id` and its original `source_question_id`. Array order sets
the displayed question number; reordering should preserve those IDs.

Question parts use stable IDs. Standalone questions have a `main` part with a null
display label; multipart questions have labelled parts. A part can contain nested
`parts` for (a)(i)/(a)(ii). Solutions and rubrics reference answerable part IDs.
The backend must validate these nested relationships, rubric totals and snapshot
IDs when accepting edited JSON. The database currently checks the top-level shapes.

## Access from the application

Authenticated tutors can read approved bank questions and manage their own papers.
Question-bank writes are reserved for trusted backend or SQL Editor operations.
The tutor profile's `id` is distinct from its `auth_user_id`; use `tutors.id` when
setting `papers.tutor_id`.

Student access uses this function, with no login:

```sql
select public.get_student_paper('REPLACE_WITH_PUBLISHED_PAPER_SHARE_TOKEN'::uuid);
```

Or, with a configured Supabase JavaScript client:

```ts
const { data, error } = await supabase.rpc('get_student_paper', {
  p_share_token: shareToken,
});
```

The function returns question content and available marks per part. It omits
solutions, rubric criteria, tutor details and source bank IDs. Invalid, draft or
archived paper tokens return `null`. The browser can use the project's publishable
key for this RPC; never put a secret/service-role key in frontend code.

A draft can become reviewed and then published. Editing a reviewed paper returns
it to draft. Published content stays frozen; make a new draft copy for revisions.
Archiving a published paper disables its student link. A tutor can replace
`share_token` to revoke the old link.

These SQL files do not connect the existing application automatically. The current
frontend still uses sample data/localStorage and the FastAPI service exposes its
health endpoint. Database queries, paper rendering, submissions, private result
links and AI marking still need application integration.

## Optional local CLI workflow

The migration and seed follow Supabase's directory conventions. With the Supabase
CLI and Docker installed, `supabase start` starts the local stack and applies its
initial schema/seed. For an intentional rebuild of a disposable local database,
`supabase db reset --local` reapplies migrations and seed data; it removes existing
local database data.

The local configuration uses PostgreSQL 17. If linking to a hosted project later,
match `db.major_version` to `show server_version;` on that project. Running a script
in the SQL Editor does not record it in the CLI's migration history: reconcile the
existing schema/history before using `supabase db push` on that project.

References: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[database seeding](https://supabase.com/docs/guides/local-development/seeding-your-database),
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security),
and [Auth user profiles](https://supabase.com/docs/guides/auth/managing-user-data).
