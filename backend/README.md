# MethodMark backend

FastAPI application for question-bank access and student submissions. Python 3.11 or newer is required; local development is pinned to Python 3.11 using `.python-version`.

## Install and run

From `backend/`:

```sh
uv sync --locked
uv run python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

This layer is self-contained: its own `pyproject.toml`, `uv.lock` and `.venv`, resolved independently of `generation/`.

The service starts without a database, credentials, or environment file. Optionally copy `.env.example` to `.env` to change settings. Environment variables take precedence over the file. `.env` is resolved relative to the backend directory.

If uv is unavailable, create a virtual environment and use `python -m pip install -e . --group dev`, then `python -m uvicorn app.main:app --reload --port 8000`. This alternative requires a pip version supporting dependency groups. The uv lockfile is the reproducible installation path.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Application liveness, name, version, and environment |
| `GET /api/v1/sample-paper/questions` | All question-bank rows, ordered by ID; verified tutor required, development only |
| `GET /api/v1/student/assignments/{token}` | Public assignment title, class and deadline |
| `POST /api/v1/student/assignments/{token}/open` | Validate class code; return questions without answer keys |
| `POST /api/v1/student/assignments/{token}/submit` | Store handwriting/photos; return a receipt |
| `GET /api/v1/submissions/{id}/attachments` | Verified owning tutor only; short-lived photo URLs |
| `/api/docs` | Interactive Swagger UI |
| `/api/redoc` | Alternative API documentation |
| `/api/openapi.json` | OpenAPI contract |

Health reports that this application is running; it does not claim database or AI-service readiness.

```json
{
  "status": "ok",
  "service": "MethodMark API",
  "version": "0.1.0",
  "environment": "development"
}
```

## Structure

```text
app/
  main.py                 Application factory and ASGI entry point
  core/config.py          Validated environment settings
  api/router.py           Route registration under /api/v1
  api/dependencies.py     Shared request dependencies
  api/routes/health.py    Health endpoint
  schemas/health.py       Typed response contract
tests/                    API and configuration checks
```

Add future feature routers under `app/api/routes/` and register them in `app/api/router.py`. Add request/response contracts under `app/schemas/`. Introduce services and persistence modules when their features are implemented.

## Configuration

| Variable | Default |
|---|---|
| `METHODMARK_APP_NAME` | `MethodMark API` |
| `METHODMARK_SUPABASE_URL` | Empty; set your Supabase project URL |
| `METHODMARK_SUPABASE_SECRET_KEY` | Empty; server-only secret key, or legacy service-role key |
| `METHODMARK_ENVIRONMENT` | `development` (`development`, `test`, or `production`) |
| `METHODMARK_CORS_ORIGINS` | `["http://localhost:5173", "http://127.0.0.1:5173"]` |

CORS origins are a JSON array of exact HTTP(S) origins. CORS is a browser policy, not authentication. The frontend development server proxies `/api` to this service. In production, configure the web server to route `/api` to the backend; the Vite development proxy is not included in a static build.

## Checks

```sh
uv run python -m pytest
uv run ruff check .
uv run ruff format --check .
```

## Current scope

The local sample-paper endpoint reads all question-bank rows through Supabase REST using a server-only secret. It preserves the JSON structure, validates the response and paginates by question ID, without modifying database data. Missing credentials return 503; upstream failures return a safe 502 message without credentials or raw upstream errors.

The secret bypasses RLS, so this temporary endpoint returns 403 outside development. Run the backend on loopback (`127.0.0.1`) for local testing. Requests require a bearer token validated through Supabase Auth. Every confirmed, non-anonymous Auth account is a tutor; the Auth user ID is used directly as tutor_id and no public.tutors table is required. Missing or expired tokens return 401; anonymous or unconfirmed accounts are denied. Authentication outages fail closed with 503. The database's anonymous permissions remain unchanged; production question selection still needs to limit access to approved bank rows.

Tutor paper saving and assignment lists use the frontend Supabase client with tutor-scoped RLS. Publishing uses one transactional RPC for the paper and selected classes. The backend handles account-free student requests with the server-only secret.

Run the updated `supabase/setup.sql` against a fresh application schema before using these endpoints; it is not an in-place upgrade. Keep Auth users when removing the old application tables/view. It creates a private `student-solutions` bucket and a service-role-only submission RPC. The RPC rechecks the active student record for the assignment class and the deadline when committing, and reuses a receipt for a repeated submission ID.

Submissions accept ink keyed by question/part IDs, plus up to five verified JPEG/PNG files of 10 MB and 25 megapixels each. Photos are uploaded before recording the receipt. Failed partial uploads are cleaned up when possible; uncertain network failures keep private objects so committed submissions are never deleted. The system does not yet have scheduled cleanup for orphaned storage objects (including objects from deleted classes).

Students do not create accounts. Public access is rate-limited to 120 requests per minute per IP in each process. A production multi-worker deployment should use a shared limiter and a request-body limit at its reverse proxy. Each student belongs to one class; the public endpoints validate that class, its active student code and the assignment; answer keys never enter their responses. Submissions close at the deadline; late uploads cannot bypass the final database check. AI grading is not connected.
