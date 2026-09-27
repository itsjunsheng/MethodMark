"""Environment-backed settings, independent of the launch directory."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="METHODMARK_",
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="MethodMark API", min_length=1)
    environment: Literal["development", "test", "production"] = "development"
    supabase_url: str = ""
    supabase_secret_key: SecretStr = SecretStr("")
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
