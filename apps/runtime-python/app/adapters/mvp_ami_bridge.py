"""
Load MVP-AMI (`devtlco1/MVP-AMI`) modules from a local checkout.

The sidecar does not vendor `meter_client.py`; set `SUNRISE_RUNTIME_MVP_AMI_ROOT` to the repo root
so `config`, `meter_client`, and `register_scaling` resolve like a normal MVP-AMI run.
"""

from __future__ import annotations

import importlib
import sys
import threading
from pathlib import Path
from typing import Any, Optional, Tuple

_lock = threading.Lock()
_registered_root: Optional[str] = None


def register_mvp_ami_import_path(root: str) -> None:
    """Insert MVP-AMI repo root at the front of `sys.path` once per process."""
    global _registered_root
    resolved = str(Path(root).expanduser().resolve())
    if not Path(resolved).is_dir():
        raise FileNotFoundError(f"MVP-AMI root is not a directory: {resolved}")

    with _lock:
        if _registered_root is None:
            if resolved not in sys.path:
                sys.path.insert(0, resolved)
            _registered_root = resolved
            return
        if _registered_root != resolved:
            raise RuntimeError(
                f"MVP-AMI import path already locked to {_registered_root!r}; "
                f"refusing {resolved!r} (restart process to switch)."
            )


def load_mvp_ami_modules(root: str) -> Tuple[Any, Any]:
    """Import MVP-AMI `config` and `meter_client` after fixing `sys.path`."""
    register_mvp_ami_import_path(root)
    config_mod = importlib.import_module("config")
    meter_mod = importlib.import_module("meter_client")
    return config_mod, meter_mod
