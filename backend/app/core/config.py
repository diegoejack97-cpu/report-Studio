from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    APP_URL: str = "http://localhost"
    SECRET_KEY: str = "change_me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    DB_PASSWORD: str = "rs_secret"
    DATABASE_URL: str = ""

    REDIS_URL: str = "redis://redis:6379/0"
    REDIS_PASSWORD: str = ""

    CORS_ORIGINS: str = "http://localhost,http://localhost:3000"

    STRIPE_SECRET_KEY: str = "sk_test_placeholder"
    STRIPE_PUBLIC_KEY: str = "pk_test_placeholder"
    STRIPE_WEBHOOK_SECRET: str = "whsec_placeholder"

    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_BUSINESS: str = ""
    STRIPE_PRICE_INDIVIDUAL_LITE: str = ""
    STRIPE_PRICE_INDIVIDUAL_PRO: str = ""
    STRIPE_PRICE_INDIVIDUAL_PLUS: str = ""

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    EMAIL_FROM: str = "noreply@reportstudio.com"

    STORAGE_PATH: str = "/app/storage"

    PLAN_FREE_LIMIT: int = 3
    PLAN_STARTER_LIMIT: int = 8
    PLAN_PRO_LIMIT: int = 30
    PLAN_BUSINESS_LIMIT: int = 80

    def get_cors_origins(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

    def get_db_url(self) -> str:
        """
        Garante que sempre será usado driver async (asyncpg)
        mesmo quando o Railway mandar 'postgresql://'
        """
        if self.DATABASE_URL:
            return self.DATABASE_URL.replace(
                "postgresql://",
                "postgresql+asyncpg://"
            )

        return (
            f"postgresql+asyncpg://rs_user:{self.DB_PASSWORD}"
            f"@db:5432/reportstudio"
        )

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()