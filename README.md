# MethodMark

A responsive tutor application for Singapore secondary mathematics, built from the proposal and use cases in `docs/`. React 19, TypeScript, Vite, and Lucide icons.

## Run locally

Set the Supabase project URL and secret key in `backend/.env` (see
[backend setup](backend/README.md)). From the project root, start the backend:

```sh
cd backend
uv sync --locked
uv run python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, from the project root, start the frontend:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and select **Create practice paper**, then
**Generate sample paper**. Both services must be running to load the question bank.
See [frontend setup](frontend/README.md) for build and browser-check commands.

## Explore the prototype

- **Overview:** assignment and review counts, sample class performance, recent assignments, and activity.
- **Practice papers:** search your saved library; create a paper from the question bank; edit questions and worked solutions; inspect method and accuracy rubrics; approve before publishing.
- **Assignments:** class/status/search filters, submission progress, shared student links, and assignment details. Published assignments retain a snapshot of their paper and rubric.
- **Marking queue:** open sample handwritten work, check each question, edit method and accuracy marks and feedback, save drafts, and confirm approval and release. Invalid marks and incomplete reviews cannot be released.
- **Classes & students:** create real classes in Supabase; add students in batches with colour-animal codes; save optional names; enrol existing students in additional classes; search and copy codes.
- **Insights:** class and time filters, topic confidence, common mistakes, and CSV export of sample historical performance.
- **Settings:** browser-local profile preferences and account logout.
- **Student assignments:** account-free class-code entry, handwriting on the paper, print/save PDF, and real submission of ink or photos.

## Current scope

The React frontend uses FastAPI to read Supabase questions when a tutor selects **Generate sample paper**. The frontend selects questions by subject, school year, subject level, topics, difficulty and optional count, preserving parts, diagrams, solutions and rubrics. See [frontend setup](frontend/README.md) and [backend setup](backend/README.md) to run both services. Tutor authentication uses Supabase Auth; AI generation is not connected, and question-bank access is currently limited to local development. Handwritten work is an illustrative transcription. Historical charts, performance averages, topic confidence, and activity use sample data; they are not calculated by an analytics service.

Papers, class assignments and student submissions persist in Supabase. Published papers are immutable. Each assigned class has its own shared link and deadline. Assignments show actual submission counts and students who have not submitted; they become **Ready for grading** at the deadline. Demo marking reviews and preferences still use namespaced local storage.

The sample workspace date is 10 September 2026. Fonts load from Google Fonts, with system fallbacks when unavailable. The backend calls Supabase to read the question bank.

## Browser checks

From `frontend/`, with the development server running on port 5173 and Google Chrome installed:

```sh
npm run test:e2e
```

Playwright checks navigation, draft generation and publishing, review validation and release, saved state, filters, downloads, mobile layout, and student-code entry. Desktop and mobile overview screenshots are written to `test-results/`.

## Files

- `frontend/src/App.tsx`: screens, shared controls, paper and review workflows.
- `frontend/src/data.ts`: typed sample papers, rubrics, classes, students, and submissions.
- `frontend/src/styles.css`: responsive layout and component styles.
- `frontend/src/refinements.css`: shared reading-size and contrast adjustments.
- `frontend/tests/workspace.spec.ts`: end-to-end browser checks.

The source documents in `docs/` are unchanged.

## Supabase database setup

Keep `auth.users`. This setup is for a fresh application schema, not an
in-place upgrade. After removing the old application tables and summary view,
run the whole [`supabase/setup.sql`](supabase/setup.sql) in the SQL Editor.
Then optionally run [`supabase/seed_questions.sql`](supabase/seed_questions.sql)
for 30 development questions. Seed inserts never overwrite existing questions.
For an existing database, run [supabase/update_papers_and_classes.sql](supabase/update_papers_and_classes.sql)
once to add saved colours and paper library deletion without resetting data.
Fresh setups already include these changes.

The six tables are `classes`, `students`, `questions`, `papers`,
`assignments` and `submissions`. Tutors reference `auth.users.id`.
`list_assignments` calculates roster/submission counts under the tutor's RLS;
there is no summary table or view. Setup also configures private photo storage.

`papers.questions_snapshot` contains the ordered questions, solutions and rubrics.
Publication freezes this snapshot. `assignments` links it to each class with
its own share token and deadline. `submissions` records a student's ink, private
photo references and receipt timestamp. Students need only the shared link and
their class's colour-animal code; the backend strips all answer keys.

After updating, run `uv sync --locked` in `backend/` and restart both services.
The new submission dependencies are Pillow and python-multipart. The SQL was
validated locally; applying it to your hosted Supabase project is a separate step.

### Class management

Each student row belongs to one class. A tutor always creates a new record when
adding someone to another class; names are independent. `(class_id, student_code)`
is unique, while a UUID provides stable submission links. Codes can repeat across
classes. Removing a student disables their code and hides them from the roster,
preserving submitted work. Deleting a class removes its students, assignments and
submission records; other classes and practice papers remain.

`add_class_students` runs as the tutor with RLS enforced and creates each batch
atomically. It locks the class while choosing unused codes from 1,152 colour-animal
pairs. Retrying the same UUIDs in that class returns the original records. Removed
codes remain reserved, and exhaustion rejects the entire batch. No secret key is
sent to the browser.

`frontend/src/api/classes.ts` owns database calls, `ClassesPage.tsx` renders classes
and rosters, and `ClassDialogs.tsx` contains the forms. Browser tests cover class
and student creation/removal, independent names, retries, and mobile/tablet layouts.
