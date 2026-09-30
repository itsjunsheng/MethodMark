"""One small adapter for OpenAI and OpenRouter structured chat completions."""

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.grading.schemas import GradingError


class ModelClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client
        router = settings.grading_provider == "openrouter"
        self.url = (
            "https://openrouter.ai/api/v1" if router else "https://api.openai.com/v1"
        ) + "/chat/completions"
        self.key = (
            settings.openrouter_api_key if router else settings.openai_api_key
        ).get_secret_value()
        if not self.key:
            raise GradingError(
                "Add the selected AI provider's API key to backend/.env before "
                "starting the grading worker."
            )
        if not settings.grading_vision_model.strip() or not settings.grading_model.strip():
            raise GradingError("Configure both grading models in backend/.env.")

    async def complete(self, model: str, system: str, content: list, contract: type[BaseModel]):
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "store": False,
            "max_completion_tokens": 12000,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": contract.__name__,
                    "strict": True,
                    "schema": contract.model_json_schema(),
                },
            },
        }
        if self.settings.grading_provider == "openrouter":
            body["max_tokens"] = body.pop("max_completion_tokens")
            body.pop("store")
            body["provider"] = {"require_parameters": True, "data_collection": "deny"}
        try:
            response = await self.client.post(
                self.url, json=body, headers={"Authorization": "Bearer " + self.key}, timeout=120
            )
            response.raise_for_status()
            data = response.json()
            choice = data["choices"][0]
            if choice.get("finish_reason") != "stop" or choice["message"].get("refusal"):
                raise GradingError(
                    "The AI could not return a complete assessment. Retry or mark manually."
                )
            return contract.model_validate_json(choice["message"]["content"])
        except httpx.HTTPStatusError as error:
            code = error.response.status_code
            if code == 401:
                message = (
                    "The selected provider rejected its API key. Check backend/.env."
                )
            elif code in (403, 404):
                message = (
                    "The selected model is not available to this API key. "
                    "Choose a model listed for your OpenAI project."
                )
            elif code in (402, 429):
                message = (
                    "The grading provider reached its credit or request limit. Retry "
                    "after resolving it."
                )
            elif code == 400:
                message = (
                    "The selected model could not accept this grading request. Check "
                    "image and structured-output support."
                )
            else:
                message = "The grading provider is unavailable. Please retry."
            raise GradingError(message) from None
        except (httpx.RequestError, ValueError, KeyError, IndexError, TypeError, ValidationError):
            raise GradingError(
                "The AI response was unavailable or invalid. Retry or mark manually."
            ) from None
