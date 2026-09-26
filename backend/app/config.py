from datetime import date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_db_url(url: str) -> str:
    """Hosted providers (Neon, Render, Supabase) hand out postgres:// URLs; SQLAlchemy needs the driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/engagement"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 8 * 60
    bcrypt_rounds: int = 12  # tests lower this; production keeps the default
    cors_origins: str = "http://localhost:3000"
    # Business "today" (due today / overdue) is evaluated in the firm's timezone, not UTC.
    business_timezone: str = "Asia/Kolkata"
    log_level: str = "INFO"

    @property
    def sqlalchemy_url(self) -> str:
        return normalize_db_url(self.database_url)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.business_timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def business_today() -> date:
    return datetime.now(settings.tz).date()
