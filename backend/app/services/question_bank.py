"""Read the question bank through Supabase's REST API using server-only credentials."""

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.config import Settings
from app.schemas.question import BankQuestion

QUESTION_COLUMNS = ",".join(BankQuestion.model_fields)
QUESTION_LIST = TypeAdapter(list[BankQuestion])


class QuestionBankError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


async def fetch_questions(settings: Settings, client: httpx.AsyncClient) -> list[BankQuestion]:
    if not settings.supabase_url or not settings.supabase_secret_key.get_secret_value():
        raise QuestionBankError(
            "The question bank is not connected. "
            "Configure the backend Supabase URL and secret key.",
            status_code=503,
        )

    secret = settings.supabase_secret_key.get_secret_value()
    headers = {"apikey": secret}
    # Legacy service-role JWTs also work; new sb_secret keys belong only in apikey.
    if not secret.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {secret}"
    questions: list[BankQuestion] = []
    params = {"select": QUESTION_COLUMNS, "order": "id.asc", "limit": "100"}

    try:
        while True:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/questions",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            batch = QUESTION_LIST.validate_python(response.json())
            if not batch:
                return questions
            # Continue until empty, including when Supabase caps pages below our limit.
            questions.extend(batch)
            params["id"] = f"gt.{batch[-1].id}"
    except httpx.TimeoutException:
        raise QuestionBankError(
            "The question bank took too long to respond. Please try again."
        ) from None
    except httpx.HTTPStatusError as error:
        if error.response.status_code in {401, 403}:
            message = "The question bank rejected the connection. Check the backend Supabase key."
        else:
            message = "The question bank could not be loaded. Please try again."
        # Never forward upstream bodies, headers or URLs containing credentials.
        raise QuestionBankError(message) from None
    except httpx.RequestError:
        raise QuestionBankError("The question bank is unreachable. Please try again.") from None
    except (ValidationError, ValueError):
        raise QuestionBankError(
            "The question bank returned an unsupported question format."
        ) from None
