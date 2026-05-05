from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings


def test_cors_origins_in_development_keep_localhost_defaults():
    settings = Settings(
        ENVIRONMENT="development",
        APP_URL="http://localhost:3000",
        CORS_ORIGINS="https://staging.reportflow.com.br",
        SECRET_KEY="dev-secret",
    )

    origins = settings.get_cors_origins()

    assert "http://localhost" in origins
    assert "http://localhost:3000" in origins
    assert "https://staging.reportflow.com.br" in origins


def test_cors_origins_in_production_only_use_configured_and_public_app_url():
    settings = Settings(
        ENVIRONMENT="production",
        APP_URL="https://app.reportflow.com.br",
        CORS_ORIGINS="https://reportflow.com.br,https://admin.reportflow.com.br",
        SECRET_KEY="prod-secret-123",
    )

    origins = settings.get_cors_origins()

    assert origins == [
        "https://reportflow.com.br",
        "https://admin.reportflow.com.br",
        "https://app.reportflow.com.br",
    ]
    assert "http://localhost" not in origins
    assert "http://localhost:3000" not in origins


def test_cors_origins_in_production_do_not_add_localhost_app_url():
    settings = Settings(
        ENVIRONMENT="prod",
        APP_URL="http://localhost:3000",
        CORS_ORIGINS="https://reportflow.com.br",
        SECRET_KEY="prod-secret-123",
    )

    origins = settings.get_cors_origins()

    assert origins == ["https://reportflow.com.br"]
    assert "http://localhost" not in origins
    assert "http://localhost:3000" not in origins
