import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_read_namespaced_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("METHODMARK_APP_NAME", "Configured API")
    monkeypatch.setenv("METHODMARK_ENVIRONMENT", "test")
    monkeypatch.setenv("METHODMARK_CORS_ORIGINS", '["https://tutor.example/"]')

    settings = Settings(_env_file=None)

    assert settings.app_name == "Configured API"
    assert settings.environment == "test"
    assert settings.cors_origins == ["https://tutor.example"]


@pytest.mark.parametrize("origin", ["*", "not-a-url", "https://tutor.example/path"])
def test_settings_reject_invalid_browser_origins(origin: str) -> None:
    with pytest.raises(ValidationError, match="CORS origins"):
        Settings(_env_file=None, cors_origins=[origin])
