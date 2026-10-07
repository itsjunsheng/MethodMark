# Grading pipeline

Implements proposal phases 5-6 and UC7/UC8: interpret handwriting, propose rubric marks,
and save tutor review drafts. Result approval, release and student results are not implemented.

## Start

1. Run the full `supabase/update.sql` in the Supabase SQL Editor for the existing database.
   Use `supabase/setup.sql` only for a fresh application schema. Keep existing Auth users.
   The update queues existing submissions as well as new ones; it does not seed grades.
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
   use **Processing** to see queued/in-progress work. Completed assessments appear under
   **Awaiting review**; inspect original work, transcription, rubric points and feedback.
   Edit marks or feedback and **Save review draft**. Students cannot see these drafts.
   Once every part is ticked **I have checked this part**, the submission moves to **Reviewed**;
   a partly checked draft shows **Review in progress** and stays under **Awaiting review**.
   The queue's `review_complete` field carries this rule, which Insights also uses.

The worker must remain running separately from Uvicorn. Without it, submissions stay queued.
Restart it after changing provider settings. Missing keys stop the worker with a configuration
message; failed API calls put the affected submission under **Processing failed**.
After correcting the issue, choose **Retry grading**, or **Review manually**.

## Flow and responsibilities

`submission transaction -> grading_jobs -> vision transcription -> rubric assessment -> tutor review`

- The submission trigger inserts one job in the same transaction as the receipt (UC11).
  Retrying an existing submission ID returns the same receipt and creates no extra job.
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
  students have no access to `grading_jobs`. There is no approval or release endpoint (UC12).

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
rubric marks, persisted drafts, conflict errors, and tablet/mobile layouts with mocked services.
The SQL was exercised with an isolated PostgreSQL engine for fresh setup, upgrade, repeated
updates, backfill, RLS, atomic enqueue, receipt replay, stale leases and deletion cascades.
Provider contracts are tested with mocked HTTP responses. No live AI grading was run without
user-supplied credentials, and the hosted Supabase migration is not applied automatically.

Provider contracts: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision),
[OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
