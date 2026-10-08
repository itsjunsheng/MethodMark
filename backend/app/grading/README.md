# Grading pipeline

Implements proposal phases 5-6 and UC7, UC8 and UC12: interpret handwriting, propose rubric marks,
save tutor review drafts, approve and release results, and show released results to students.

## Start

1. Run the full `supabase/update.sql` in the Supabase SQL Editor for the existing database.
   Use `supabase/setup.sql` only for a fresh application schema. Keep existing Auth users.
   Submissions without a job appear as **Not yet sent for grading**; existing jobs keep their state.
   If the grading schema is already installed, the focused migrations
   `supabase/migrations/20261008_manual_class_grading.sql` (class-level sending) and
   `supabase/migrations/20261008_result_release.sql` (release, results and audit trail) are sufficient.
2. Add one provider key to `backend/.env`. The selected provider serves both stages:

   ```dotenv
   OPENAI_API_KEY=your-key
   METHODMARK_GRADING_PROVIDER=openai
   METHODMARK_GRADING_VISION_MODEL=gpt-5.4-mini
   METHODMARK_GRADING_MODEL=gpt-5.4-mini
   ```

   Or use OpenRouter:

   ```dotenv
   OPENROUTER_API_KEY=your-key
   METHODMARK_GRADING_PROVIDER=openrouter
   METHODMARK_GRADING_VISION_MODEL=openai/gpt-4.1
   METHODMARK_GRADING_MODEL=openai/gpt-4.1
   ```

   Choose an image-capable model for the first stage and a structured-JSON-capable model
   for both stages. These are configurable starting models, not an accuracy benchmark.
   The OpenAI model must be available to your API project; check access with
   `GET /v1/models` if a configured model is rejected.
   Keep the existing `METHODMARK_SUPABASE_URL` and `METHODMARK_SUPABASE_SECRET_KEY`.
   Keys remain server-side; never use a `VITE_` variable for provider or service keys.
3. Restart the normal backend and frontend. In a separate terminal:

   ```sh
   cd backend
   uv sync --locked
   uv run python -m app.grading.worker
   ```

4. Submit handwriting or photos through a published assignment. In **Marking queue**,
   **All submissions** opens first. Select a class in the dropdown, then choose **Send for grading**
   beside **Refresh** to queue all new submissions in that class, including any hidden by search.
   With **All classes** selected, the button prompts the tutor to select a class. Repeated sends do not
   regrade existing jobs. Queued/in-progress work remains visible in each student row.
   Completed assessments appear under
   **Awaiting review**; inspect original work, transcription, rubric points and feedback.
   Edit marks or feedback and **Save review draft**. Students cannot see these drafts.
   Once every part is ticked **I have checked this part**, the submission moves to **Ready to release**;
   a partly checked draft shows **Review in progress** and stays under **Awaiting review**.
   The queue's `review_complete` field carries this rule.
5. **Approve and release** (UC8) shows the total and the method and accuracy split for confirmation,
   then saves and releases in one database transaction. The submission moves to **Released** and
   becomes read-only; **Reopen to make changes** lets the tutor correct it, while the student keeps
   the last released result until the next release. Insights counts only released results.
6. Students reopen the assignment link and enter their code (UC12). They see **Your tutor is
   reviewing your work** until release, then their marks per rubric point code and the tutor's feedback.

The worker must remain running separately from Uvicorn. Without it, submissions stay queued.
Restart it after changing provider settings. Missing keys stop the worker with a configuration
message; failed API calls show an error on the right of the affected student's row.
After correcting the issue, choose **Retry grading**, or **Review manually**.

## Flow and responsibilities

`submission transaction -> submitted job -> tutor sends class -> queued job -> vision transcription -> rubric assessment -> tutor review -> approve and release -> student result`

- The submission trigger inserts one `submitted` job in the same transaction as the receipt (UC11).
  Retrying an existing submission ID returns the same receipt and creates no extra job.
- `POST /api/v1/grading/classes/{class_id}/send` checks tutor ownership and calls the
  service-only `send_class_for_grading` database function. It atomically moves only that
  tutor's unsent submissions in that class to `queued`; failed jobs retain their row-level retry.
- `worker.py` claims jobs sequentially, independently of the web request. A ten-minute lease
  is renewed between model calls. Expired leases are reclaimed; three interrupted attempts
  produce a failed job. Explicit retry is required for provider errors, avoiding endless spend.
- `evidence.py` renders normalized pen strokes as images and normalizes uploaded JPEG/PNG
  orientation and dimensions. New digital submissions include answer-space dimensions;
  older submissions use the original desktop paper proportions as a fallback.
- `pipeline.py` first transcribes without exposing the expected answer to that stage. A
  second model call assesses each rubric point, with independent method and accuracy credit
  where the rubric permits. All calls use strict JSON schemas. Student content is evidence,
  never instructions. Question/part/point coverage, integer limits and supporting excerpts
  are checked again in code. Unreadable evidence stays unassessed and flagged. A part the model
  omits is blank when no answer space or photo was submitted for it; otherwise it, and any
  missing, repeated or unknown rubric point, stays unassessed and flagged instead of failing
  the whole submission. Marks outside the rubric limits still fail the job.
- The approved solution and rubric come from `papers.questions_snapshot`, which copies the
  question bank at publication. Later bank edits cannot silently change an assignment's marks.
  Missing or incomplete rubrics fail safely rather than inventing criteria.
- `store.py` persists original AI results separately from `review_draft`. Version checks prevent
  stale tabs overwriting reviews; lease checks prevent stale workers overwriting newer attempts.
- `api/routes/grading.py` verifies the owning tutor on every read/write. RLS also isolates tutors;
  students have no access to `grading_jobs`. `POST /{id}/release` accepts only a complete, valid
  review and calls the service-only `release_result` function, which updates the job, writes the
  `results` row and logs the release atomically; `POST /{id}/reopen` calls `reopen_result`.
- `results` holds the approved review a student may see; `POST /api/v1/student/assignments/{token}/result`
  reads only that table for the student matched by link and code, and builds the student view in
  `results.py` without rubric criteria, solutions, AI evidence or transcriptions.
- `review_events` is an append-only audit trail (SRS 6.6): a trigger logs every saved draft with the
  tutor who saved it, and release and reopen are logged by their functions. The AI's original
  proposal stays unchanged in `grading_jobs.result`, so tutor changes remain distinguishable.

One `grading_jobs` row holds the queue state, original assessment and review draft for each
submission. Deleting its submission cascades to the job; archiving a paper or class retains it.
Reviewing a failed job manually preserves the failure information and stores only the tutor draft.

## Settings and limits

- `METHODMARK_GRADING_POLL_SECONDS`: 5 by default.
- `METHODMARK_GRADING_CONFIDENCE_THRESHOLD`: 0.8 by default. Confidence is model-reported,
  not calibrated; flags help prioritize tutor checks, and all results require review.
- Up to five uploaded photos are attached for each question's reading request. Number photo
  answers clearly. Each question with evidence takes two model calls; ambiguous numbering is
  flagged. Unsupported provider/model capabilities fail visibly instead of silently falling back.
- Blank digital answer spaces without photos receive zero provisional marks without a model call.
- The adapter sends OpenAI requests with storage disabled. OpenRouter requires supported
  parameters and routes only to providers that deny data collection. The selected provider
  receives the submitted images and relevant question content. Logs omit work, keys and responses.
- Model-call timeout is 120 seconds. An interrupted attempt may incur provider cost again when
  reclaimed, but only the current lease can save a result.
- Photo preview links expire after five minutes; reopen the review to refresh them.
- This is a review pipeline, not a validated autonomous examiner. A representative handwriting
  and mathematics evaluation set is still needed before relying on model accuracy at scale.

## Checks

```sh
cd backend
uv run python -m pytest
uv run ruff check .
```

Browser coverage: `frontend/tests/grading.spec.ts` checks empty/live queues, retry, editable
rubric marks, persisted drafts, conflict errors, approve and release, reopen, failed releases, and
tablet/mobile layouts with mocked services; `frontend/tests/results.spec.ts` checks the student's
pending and released views, retry after a failed load, and phone layout.
`supabase/tests/result_release.mjs` checks release and reopen ownership, versioning, the audit
trail, read access and deletion cascades, for both a fresh setup and an upgrade.
`supabase/tests/class_grading.mjs` exercises fresh setup and upgrade in isolated PostgreSQL,
including class ownership, repeated sends, existing-job preservation and worker claiming.
With `@electric-sql/pglite` installed in a temporary directory, run it from the repository root:

```sh
node supabase/tests/class_grading.mjs <temporary-directory>/node_modules/@electric-sql/pglite/dist/index.js
```

The SQL was exercised with an isolated PostgreSQL engine for fresh setup, upgrade, repeated
updates, backfill, RLS, atomic enqueue, receipt replay, stale leases and deletion cascades.
Provider contracts are tested with mocked HTTP responses. No live AI grading was run without
user-supplied credentials, and the hosted Supabase migration is not applied automatically.

Provider contracts: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision),
[OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
