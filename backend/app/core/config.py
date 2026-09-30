"""Environment-backed settings, independent of the launch directory."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="METHODMARK_",
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = Field(default="MethodMark API", min_length=1)
    environment: Literal["development", "test", "production"] = "development"
    supabase_url: str = ""
    supabase_secret_key: SecretStr = SecretStr("")
    grading_provider: Literal["openai", "openrouter"] = "openai"
    grading_vision_model: str = "gpt-5.4-mini"
    grading_model: str = "gpt-5.4-mini"
    grading_poll_seconds: float = Field(default=5, ge=1, le=60)
    grading_confidence_threshold: float = Field(default=0.8, ge=0, le=1)
    openai_api_key: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("OPENAI_API_KEY", "METHODMARK_OPENAI_API_KEY"),
    )
    openrouter_api_key: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("OPENROUTER_API_KEY", "METHODMARK_OPENROUTER_API_KEY"),
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, origins: list[str]) -> list[str]:
        normalized = []
        for origin in origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or parsed.username is not None
                or parsed.password is not None
            ):
                raise ValueError(
                    "CORS origins must be HTTP(S) origins without paths or credentials"
                )
            # Accessing port also rejects invalid port numbers during startup.
            _ = parsed.port
            normalized.append(origin.rstrip("/"))
        return normalized
