# MethodMark

A responsive tutor workspace for Singapore secondary mathematics, built from the proposal and use cases in `docs/`. React 19, TypeScript, Vite, and Lucide icons.

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
- **Practice papers:** search the library; configure a sample paper; edit questions and worked solutions; inspect method and accuracy rubrics; approve before publishing.
- **Assignments:** class/status/search filters, submission progress, student preview links, and assignment details. Published assignments retain a snapshot of their paper and rubric.
- **Marking queue:** open sample handwritten work, check each question, edit method and accuracy marks and feedback, save drafts, and confirm approval and release. Invalid marks and incomplete reviews cannot be released.
- **Classes & students:** four sample classes, student search, individual learning focuses, and illustrative progress histories.
- **Insights:** class and time filters, topic confidence, common mistakes, and CSV export of sample historical performance.
- **Settings:** browser-local name and workspace preferences.
- **Student preview:** account-free class-code entry, on-screen sample answers, print/save PDF, and local photo selection. No files or answers are uploaded.

## Current scope

The React frontend uses FastAPI to read Supabase questions when a tutor selects **Generate sample paper**. All questions are included for now, with parts, diagrams, solutions and rubrics. See [frontend setup](frontend/README.md) and [backend setup](backend/README.md) to run both services. Tutor authentication and AI generation are not connected; question-bank access is currently limited to local development. Handwritten work is an illustrative transcription. Historical charts, performance averages, topic confidence, and activity use sample data; they are not calculated by an analytics service.

Paper, assignment, review, and preference edits persist in this browser through namespaced `localStorage` entries. Assignment preview links therefore work with data in that browser; they are not public assignment links. Clear the site's local storage to reset the demo.

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

The database schema, sample data and SQL Editor instructions are in
[`supabase/README.md`](supabase/README.md). For a fresh Supabase project, copy the
complete [`supabase/setup.sql`](supabase/setup.sql) into its SQL Editor and run it.
Sample-paper generation reads the Supabase question bank through the backend. Saved papers and the remaining demo workflows still use browser-local data.
