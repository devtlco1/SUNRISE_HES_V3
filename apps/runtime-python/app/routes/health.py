import logging
from pathlib import Path

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.health import HealthResponse

log = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    log.debug("health_check")
    root = (settings.mvp_ami_root or "").strip()
    mvp_ok = bool(root) and Path(root).expanduser().is_dir()

    from app.tcp_listener.staged_modem_listener import get_tcp_modem_listener

    st = get_tcp_modem_listener().get_status_dict()
    tcp_bind = None
    if settings.tcp_listener_enabled:
        tcp_bind = f"{settings.tcp_listener_host}:{settings.tcp_listener_port}"
    staged_remote = None
    if st.get("stagedRemoteHost") is not None and st.get("stagedRemotePort") is not None:
        staged_remote = f"{st['stagedRemoteHost']}:{st['stagedRemotePort']}"

    return HealthResponse(
        adapter=settings.adapter,
        mvpAmiRootConfigured=mvp_ok,
        tcpModemListenerEnabled=bool(st.get("listenerEnabled")),
        tcpModemListenerListening=bool(st.get("listening")),
        tcpModemListenerBind=tcp_bind,
        tcpStagedSocketPresent=bool(st.get("stagedPresent")),
        tcpStagedRemote=staged_remote,
    )
