# MethodMark backend

FastAPI application with a Supabase question-bank reader. Python 3.11 or newer is required; local development is pinned to Python 3.11 using `.python-version`.

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
| `GET /api/v1/sample-paper/questions` | All question-bank rows, ordered by ID; development only |
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

The secret bypasses RLS, so this temporary endpoint returns 403 outside development. Run the backend on loopback (`127.0.0.1`) for local testing. Verified tutor authentication and authorization must be added before enabling question-bank access in production; the database's anonymous permissions remain unchanged.

Paper saving and assignment snapshots still use browser-local storage. Authentication, paper CRUD, uploads, AI generation and marking pipelines remain unimplemented. Students still do not need login accounts.
