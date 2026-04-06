"""Shared MVP-AMI bootstrap (config import, load_config) for serial host-initiated reads."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Union

from app.adapters.mvp_ami_bridge import load_mvp_ami_modules
from app.config import Settings
from app.schemas.requests import ChannelSpec

log = logging.getLogger(__name__)


@dataclass
class MvpAmiBootstrapOk:
    app_cfg: Any
    meter_mod: Any
    root: str
    cfg_path: str


@dataclass
class MvpAmiBootstrapFailure:
    code: str
    message: str
    details: Optional[dict] = None


def mvp_ami_bootstrap(
    settings: Settings,
    channel: Optional[ChannelSpec],
) -> Union[MvpAmiBootstrapOk, MvpAmiBootstrapFailure]:
    root = (settings.mvp_ami_root or "").strip()
    if not root:
        return MvpAmiBootstrapFailure(
            code="MVP_AMI_ROOT_REQUIRED",
            message="Set SUNRISE_RUNTIME_MVP_AMI_ROOT to a local MVP-AMI repository path.",
        )

    cfg_path = settings.mvp_ami_config_path or ""
    if not cfg_path.strip():
        cfg_path = str(Path(root) / "config.json")
    cfg_path = str(Path(cfg_path).expanduser().resolve())

    if not Path(cfg_path).is_file():
        return MvpAmiBootstrapFailure(
            code="MVP_AMI_CONFIG_MISSING",
            message=f"MVP-AMI config file not found: {cfg_path}",
            details={"configPath": cfg_path},
        )

    try:
        config_mod, meter_mod = load_mvp_ami_modules(root)
    except Exception as exc:  # noqa: BLE001
        log.exception("mvp_ami_import_failed")
        return MvpAmiBootstrapFailure(
            code="MVP_AMI_IMPORT_FAILED",
            message=f"Failed to import MVP-AMI modules from {root}: {exc}",
            details={"mvpAmiRoot": root, "error": str(exc)},
        )

    load_config = getattr(config_mod, "load_config", None)
    if load_config is None:
        return MvpAmiBootstrapFailure(
            code="MVP_AMI_CONFIG_API_UNEXPECTED",
            message="MVP-AMI config module has no load_config().",
        )

    try:
        app_cfg = load_config(cfg_path)
    except Exception as exc:  # noqa: BLE001
        return MvpAmiBootstrapFailure(
            code="MVP_AMI_CONFIG_LOAD_FAILED",
            message=f"Invalid or unreadable MVP-AMI config: {exc}",
            details={"configPath": cfg_path, "error": str(exc)},
        )

    if channel and channel.type == "serial" and channel.devicePath:
        app_cfg.serial.port_primary = channel.devicePath.strip()
        log.info("serial_override_from_request", extra={"port": app_cfg.serial.port_primary})

    return MvpAmiBootstrapOk(app_cfg=app_cfg, meter_mod=meter_mod, root=root, cfg_path=cfg_path)


def channel_spec_is_tcp(channel: Optional[ChannelSpec]) -> bool:
    """True when request asks for outbound TCP (modem / transparent tunnel), not serial."""
    if channel is None:
        return False
    return channel.type in ("tcp", "tcp_client")


def find_stage(diags: list, stage: str):
    for d in diags:
        if getattr(d, "stage", None) == stage:
            return d
    return None


def diagnostic_dump(diags: list) -> list[dict]:
    return [
        {
            "stage": getattr(d, "stage", ""),
            "success": bool(getattr(d, "success", False)),
            "message": getattr(d, "message", ""),
            "details": getattr(d, "details", {}) or {},
        }
        for d in diags
    ]
