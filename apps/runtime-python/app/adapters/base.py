"""Protocol runtime adapter — swap stub / MVP-AMI without changing HTTP routes."""

from abc import ABC, abstractmethod

from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import (
    DiscoverSupportedObisRequest,
    ReadBasicRegistersRequest,
    ReadIdentityRequest,
)


class ProtocolRuntimeAdapter(ABC):
    @abstractmethod
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        raise NotImplementedError

    @abstractmethod
    def read_basic_registers(self, request: ReadBasicRegistersRequest) -> RuntimeResponseEnvelope:
        raise NotImplementedError

    @abstractmethod
    def discover_supported_obis(self, request: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
        raise NotImplementedError
