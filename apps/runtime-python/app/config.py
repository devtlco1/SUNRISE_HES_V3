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
    """
    Legacy single OBIS string (default was 0.0.96.1.1.255). MVP-AMI `read_identity` uses a fixed pair
    on wire: 0.0.96.1.0.255 (canonical serial → IdentityPayload.serialNumber) and 0.0.96.1.1.255 (aux → logicalDeviceName).
    This setting is not used for MVP-AMI identity phase1 OBIS selection.
    """
    identity_obis: str = "0.0.96.1.1.255"
    """
    Comma-separated OBIS list for read-basic-registers (default: clock, active import, L1 voltage).
    """
    basic_registers_obis: str = "0.0.1.0.0.255,1.0.1.8.0.255,1.0.32.7.0.255"
    """Disconnect control (class 70) logical name for relay status read and remote disconnect/reconnect methods."""
    relay_disconnect_control_ln: str = "0.0.96.3.10.255"
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
    tcp_listener_enabled: bool = Field(
        default=False,
        description="When true, start background listener on tcp_listener_host:tcp_listener_port.",
    )
    tcp_listener_host: str = Field(default="0.0.0.0", description="Bind address for inbound modem TCP.")
    tcp_listener_port: int = Field(
        default=4059,
        ge=1,
        le=65535,
        description="Listen port for inbound modem (distinct from FastAPI SUNRISE_RUNTIME_PORT).",
    )
    tcp_listener_backlog: int = Field(default=8, ge=1, le=128, description="listen() backlog.")
    inbound_obis_wire_chunk_size: int = Field(
        default=8,
        ge=1,
        le=64,
        description="Wire rows per staged inbound TCP socket before closing and waiting for modem reconnect (OBIS job).",
    )
    inbound_obis_job_restage_timeout_seconds: float = Field(
        default=180.0,
        ge=5.0,
        le=3600.0,
        description="Max wait for next staged inbound connection between OBIS job chunks.",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
