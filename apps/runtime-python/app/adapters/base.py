"""Protocol runtime adapter — swap stub / MVP-AMI without changing HTTP routes."""

from abc import ABC, abstractmethod

from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadIdentityRequest


class ProtocolRuntimeAdapter(ABC):
    @abstractmethod
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        raise NotImplementedError
