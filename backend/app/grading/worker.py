"""Run with: uv run python -m app.grading.worker"""

import asyncio
import logging

import httpx

from app.core.config import Settings
from app.grading.pipeline import grade
from app.grading.provider import ModelClient
from app.grading.schemas import GradingError
from app.grading.store import GradingStore, LeaseLost

log = logging.getLogger(__name__)


async def process_job(db, provider, job):
    try:
        submission = await db.submission(job["submission_id"])
        photos = await db.photos(submission)
        result = await grade(
            submission["assignments"]["papers"],
            submission,
            photos,
            provider,
            lambda: db.heartbeat(job),
        )
        await db.worker_update(
            job,
            {
                "status": "awaiting_review",
                "result": result,
                "error": None,
                "flagged": any(p["flags"] for q in result["questions"] for p in q["parts"]),
                "provider": provider.settings.grading_provider,
                "vision_model": provider.settings.grading_vision_model,
                "grading_model": provider.settings.grading_model,
                "lease_token": None,
                "lease_expires_at": None,
                "version": job["version"] + 1,
            },
        )
    except LeaseLost:
        log.info("Job was removed or claimed by another worker.")
    except Exception as error:
        message = (
            str(error)
            if isinstance(error, GradingError)
            else "Processing failed. Retry grading or review the submission manually."
        )
        # Never log provider responses, keys, images or student work.
        log.warning("Grading failed (%s).", type(error).__name__)
        try:
            await db.worker_update(
                job,
                {
                    "status": "failed",
                    "error": message,
                    "lease_token": None,
                    "lease_expires_at": None,
                    "version": job["version"] + 1,
                },
            )
        except LeaseLost:
            pass


async def run():
    settings = Settings()
    async with httpx.AsyncClient(timeout=30) as database, httpx.AsyncClient(timeout=120) as ai:
        provider = ModelClient(settings, ai)
        db = GradingStore(settings, database)
        log.info("Grading worker started; waiting for queued submissions.")
        while True:
            try:
                job = await db.claim()
                if job:
                    await process_job(db, provider, job)
                    continue
            except Exception as error:
                log.warning(
                    "Queue unavailable (%s); retrying shortly. Check database setup.",
                    type(error).__name__,
                )
            await asyncio.sleep(settings.grading_poll_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        asyncio.run(run())
    except GradingError as error:
        raise SystemExit(str(error)) from None
    except KeyboardInterrupt:
        pass
