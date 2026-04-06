from functools import lru_cache

from app.adapters.base import ProtocolRuntimeAdapter
from app.adapters.mvp_ami_placeholder import MvpAmiRuntimeAdapter
from app.adapters.stub import StubRuntimeAdapter
from app.config import get_settings


@lru_cache
def get_runtime_adapter_cached(adapter_mode: str) -> ProtocolRuntimeAdapter:
    if adapter_mode == "mvp_ami":
        return MvpAmiRuntimeAdapter()
    return StubRuntimeAdapter()


def get_runtime_adapter() -> ProtocolRuntimeAdapter:
    return get_runtime_adapter_cached(get_settings().adapter)
