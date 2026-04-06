"""Environment-driven configuration for the protocol runtime sidecar."""

from functools import lru_cache
from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SUNRISE_RUNTIME_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8766
    log_level: str = "INFO"
    """
    `stub` — returns explicit simulated envelope (no wire).
    `mvp_ami` — reserved; currently returns not-implemented-style envelope until wired to MVP-AMI.
    """
    adapter: Literal["stub", "mvp_ami"] = "stub"
    """If set, require `Authorization: Bearer <token>` on `/v1/*` routes. `/health` stays open."""
    service_token: Optional[str] = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
