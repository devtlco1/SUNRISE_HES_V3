"""Environment-driven configuration for the protocol runtime sidecar."""

from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field
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
    `stub` — simulated envelope (no wire).
    `mvp_ami` — host-initiated reads via local MVP-AMI (`MeterClient.run_phase1` serial or `run_phase1_tcp_socket` TCP client).
    """
    adapter: Literal["stub", "mvp_ami"] = "stub"
    """If set, require `Authorization: Bearer <token>` on `/v1/*` routes. `/health` stays open."""
    service_token: Optional[str] = None
    """Absolute path to cloned https://github.com/devtlco1/MVP-AMI (required for `adapter=mvp_ami`)."""
    mvp_ami_root: Optional[str] = None
    """Path to MVP-AMI `config.json`. Default: `<mvp_ami_root>/config.json`."""
    mvp_ami_config_path: Optional[str] = None
    """Logical name read after association (default identity OBIS)."""
    identity_obis: str = "0.0.96.1.1.255"
    """
    Comma-separated OBIS list for read-basic-registers (default: clock, active import, L1 voltage).
    """
    basic_registers_obis: str = "0.0.1.0.0.255,1.0.1.8.0.255,1.0.32.7.0.255"
    """Association LN logical name whose attribute 2 (object list) is read for discovery."""
    discovery_association_ln: str = "0.0.40.0.0.255"
    """Directory for JSON discovery snapshots (per-meter subfolders). Default under sidecar `data/`."""
    discovery_snapshot_dir: str = ""
    """After successful on-wire discovery, write `latest.json` + history copy."""
    discovery_snapshot_autosave: bool = True
    """Max history JSON files per meter (oldest deleted)."""
    discovery_snapshot_max_history: int = 32
    tcp_client_connect_timeout_seconds: float = Field(
        default=15.0,
        description="Default TCP connect timeout (s) when channel.type is tcp/tcp_client (read-identity).",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
