# MethodMark frontend

React 19, TypeScript, Vite, and Lucide icons. This directory contains the responsive tutor dashboard and student preview.

## Development

From `frontend/`:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. To use **Generate sample paper**, also run the backend:

```sh
cd ../backend
uv sync --locked
uv run python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Set `METHODMARK_SUPABASE_URL` and `METHODMARK_SUPABASE_SECRET_KEY` in `backend/.env` first. The sample-paper flow uses the backend API; it does not use the frontend publishable key. Keep the secret key in the backend only. This endpoint is available only with `METHODMARK_ENVIRONMENT=development` until tutor authentication is connected. Other dashboard screens retain their existing sample data.

Vite forwards `/api/*` requests to http://127.0.0.1:8000. To override the development target, copy `.env.example` to `.env` and set `API_PROXY_TARGET`. Keep browser calls relative, such as `fetch('/api/v1/health')`. Do not put secrets in `VITE_*` variables; those are included in client bundles.

## Build and check

```sh
npm run build
npm run preview
npm run test:e2e
```

Playwright uses an installed Google Chrome and starts Vite automatically if it is not already running. Checks cover navigation, paper creation/publishing, review validation, browser-local persistence, filters, downloads, mobile layout, and student-code entry. Screenshots are written to `test-results/`.

The production output is `dist/`. Vite's `/api` development proxy is not part of that output: configure API routing in the deployment web server.

## Features and sample-data boundary

- Overview, practice papers, assignments, marking queue, classes/students, insights, and workspace preferences.
- Paper and rubric editing, assignment snapshots, review drafts, approval confirmation, and CSV exports.
- Student preview with class-code entry, sample answers, print/save PDF, and local photo selection.

**Generate sample paper** fetches every row from Supabase `questions`, ordered by ID, through `GET /api/v1/sample-paper/questions`. The builder currently asks only for a title and duration; topic, level, status and count filters are intentionally not applied. Each question retains shared text, parts, SVG diagrams, worked solutions and individual marking points. Totals are calculated from `max_marks`. Loading, empty-bank, failure/retry and cancellation states never substitute hardcoded questions.

The preview can edit text and solution steps in its local paper snapshot. It does not update the source question bank or write to the Supabase `papers` table. Existing library/demo records remain in `src/data.ts`. The proposed AI pipeline is not invoked. Submitted answers and photos are not uploaded. Historical analytics remain illustrative. Sample records use September 2026 dates.

Browser edits persist in namespaced local-storage keys, unchanged by the directory move. To retain existing demo state, use the same frontend origin as before (including `localhost` versus `127.0.0.1`). Preview assignment links are still browser-local.

Fonts load from Google Fonts with system fallbacks. Question fetching, paper mapping and structured rendering live in `src/api/questions.ts`, `src/lib/paperQuestions.ts` and `src/components/QuestionContent.tsx`. Browser regression tests mock the backend using fixtures matching `supabase/seed.sql`.
