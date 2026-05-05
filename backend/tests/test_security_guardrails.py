from pathlib import Path
import importlib
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


from app.core.config import Settings


@pytest.mark.parametrize("secret", ["", "change_me", "changeme", "secret", "development", "dev"])
def test_secret_key_is_rejected_in_production_for_insecure_values(secret):
    settings = Settings(ENVIRONMENT="production", SECRET_KEY=secret)

    with pytest.raises(ValueError, match="SECRET_KEY must be set to a secure value in production."):
        settings.validate_security()


def test_secret_key_allows_secure_value_in_production():
    settings = Settings(ENVIRONMENT="production", SECRET_KEY="super-secure-prod-key-123")

    settings.validate_security()


def test_debug_env_route_is_not_registered_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "super-secure-prod-key-123")

    for module_name in ["app.main", "app.core.config"]:
        sys.modules.pop(module_name, None)

    main = importlib.import_module("app.main")
    route_paths = {route.path for route in main.app.routes}

    assert "/debug/env" not in route_paths
