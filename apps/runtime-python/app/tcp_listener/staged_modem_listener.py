"""
Process-local TCP listener: modem dials server → accept → stage one socket → operator triggers read-identity.

Does not run MVP-AMI on accept; only on explicit POST /v1/runtime/tcp-listener/read-identity.
"""

from __future__ import annotations

import logging
import socket
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from app.config import get_settings

log = logging.getLogger(__name__)


def _iso_z() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sock_is_open(sock: Optional[socket.socket]) -> bool:
    if sock is None:
        return False
    try:
        return sock.fileno() >= 0
    except Exception:  # noqa: BLE001
        return False


@dataclass
class StagedSocketMeta:
    remote_host: str
    remote_port: int
    accepted_at_utc: str
    local_bound: str


@dataclass
class TcpModemListenerController:
    """
    One listening socket + at most one staged accepted connection.
    Replacement: new inbound connection closes the previous staged socket (if any).
    """

    _stop_event: threading.Event = field(default_factory=threading.Event)
    _thread: Optional[threading.Thread] = None
    _server_sock: Optional[socket.socket] = None
    _holder_lock: threading.Lock = field(default_factory=threading.Lock)
    _session_lock: threading.Lock = field(default_factory=threading.Lock)
    _inbound_operator_lock: threading.Lock = field(default_factory=threading.Lock)
    _inbound_operator_busy: bool = False
    _staged_sock: Optional[socket.socket] = None
    _staged_meta: Optional[StagedSocketMeta] = None
    _last_replacement_reason: Optional[str] = None
    _last_bind_error: Optional[str] = None
    _session_in_progress: bool = False
    _last_tcp_listener_trigger: Optional[dict[str, Any]] = None

    def begin_inbound_operator_action(self) -> bool:
        """
        Single-flight guard for staged inbound work (read/relay/job).
        Call from route or worker entry; pair with end_inbound_operator_action() in a finally block.
        """
        with self._inbound_operator_lock:
            if self._inbound_operator_busy:
                return False
            self._inbound_operator_busy = True
            return True

    def end_inbound_operator_action(self) -> None:
        with self._inbound_operator_lock:
            self._inbound_operator_busy = False

    def start(self) -> None:
        s = get_settings()
        if not s.tcp_listener_enabled:
            log.info("tcp_modem_listener_disabled")
            return
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._last_bind_error = None
        self._thread = threading.Thread(target=self._run_accept_loop, name="tcp-modem-listener", daemon=True)
        self._thread.start()
        log.info(
            "tcp_modem_listener_thread_started",
            extra={"host": s.tcp_listener_host, "port": s.tcp_listener_port},
        )

    def stop(self) -> None:
        self._stop_event.set()
        try:
            if self._server_sock is not None:
                try:
                    self._server_sock.close()
                except Exception:  # noqa: BLE001
                    pass
                self._server_sock = None
        finally:
            with self._holder_lock:
                self._close_staged_unlocked(reason="listener_shutdown")
            if self._thread is not None:
                self._thread.join(timeout=3.0)
                self._thread = None
        log.info("tcp_modem_listener_stopped")

    def _close_staged_unlocked(self, *, reason: str) -> None:
        if self._staged_sock is not None:
            try:
                self._staged_sock.close()
            except Exception:  # noqa: BLE001
                pass
            self._last_replacement_reason = reason
        self._staged_sock = None
        self._staged_meta = None

    def _run_accept_loop(self) -> None:
        s = get_settings()
        host = (s.tcp_listener_host or "0.0.0.0").strip()
        port = int(s.tcp_listener_port)
        backlog = max(1, int(s.tcp_listener_backlog))
        srv: Optional[socket.socket] = None
        try:
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind((host, port))
            srv.listen(backlog)
            srv.settimeout(1.0)
            self._server_sock = srv
            log.info("tcp_modem_listener_bound", extra={"host": host, "port": port})
        except Exception as exc:  # noqa: BLE001
            self._last_bind_error = str(exc)
            log.error("tcp_modem_listener_bind_failed", extra={"error": str(exc), "host": host, "port": port})
            if srv is not None:
                try:
                    srv.close()
                except Exception:  # noqa: BLE001
                    pass
            self._server_sock = None
            return

        assert self._server_sock is not None
        while not self._stop_event.is_set():
            try:
                conn, addr = self._server_sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            try:
                conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            except Exception:  # noqa: BLE001
                pass
            rh, rp = str(addr[0]), int(addr[1])
            meta = StagedSocketMeta(
                remote_host=rh,
                remote_port=rp,
                accepted_at_utc=_iso_z(),
                local_bound=f"{host}:{port}",
            )
            with self._holder_lock:
                if self._staged_sock is not None and _sock_is_open(self._staged_sock):
                    self._close_staged_unlocked(reason="replaced_by_new_inbound_connection")
                self._staged_sock = conn
                self._staged_meta = meta
            log.info("tcp_modem_staged_connection", extra={"remote": f"{rh}:{rp}"})

        try:
            if self._server_sock is not None:
                self._server_sock.close()
        except Exception:  # noqa: BLE001
            pass
        self._server_sock = None

    def get_status_dict(self) -> dict[str, Any]:
        s = get_settings()
        with self._holder_lock:
            staged_open = _sock_is_open(self._staged_sock)
            meta = self._staged_meta
            rep = self._last_replacement_reason
        thr_alive = self._thread is not None and self._thread.is_alive()
        listening = self._server_sock is not None and _sock_is_open(self._server_sock)
        return {
            "listenerEnabled": bool(s.tcp_listener_enabled),
            "listenerMode": "staged_inbound",
            "bindHost": s.tcp_listener_host,
            "bindPort": s.tcp_listener_port,
            "backlog": s.tcp_listener_backlog,
            "threadAlive": thr_alive,
            "listening": listening,
            "lastBindError": self._last_bind_error,
            "stagedPresent": staged_open and meta is not None,
            "stagedRemoteHost": meta.remote_host if meta else None,
            "stagedRemotePort": meta.remote_port if meta else None,
            "stagedAcceptedAtUtc": meta.accepted_at_utc if meta else None,
            "stagedSocketOpen": staged_open,
            "stagedLocalBound": meta.local_bound if meta else None,
            "lastStagedReplacementReason": rep,
            "sessionTriggerInProgress": bool(
                self._session_in_progress or self._inbound_operator_busy
            ),
            "lastTcpListenerTrigger": self._last_tcp_listener_trigger,
        }

    def record_tcp_listener_trigger(self, record: dict[str, Any]) -> None:
        """Last explicit trigger (read-identity / read-basic-registers) for operators."""
        with self._holder_lock:
            self._last_tcp_listener_trigger = record

    def take_staged_socket_for_session(self) -> Tuple[Optional[socket.socket], Optional[str], Optional[StagedSocketMeta]]:
        """
        Remove staged socket from the slot (caller owns FD; must close after use).
        Returns (sock, remote_endpoint, meta_copy).
        """
        with self._holder_lock:
            if not _sock_is_open(self._staged_sock):
                self._close_staged_unlocked(reason="staged_socket_dead_or_missing")
                return None, None, None
            sock = self._staged_sock
            meta = self._staged_meta
            self._staged_sock = None
            self._staged_meta = None
            endpoint = f"{meta.remote_host}:{meta.remote_port}" if meta else "unknown"
            return sock, endpoint, meta

    def session_context(self):
        """Serialize trigger handlers; mark session_in_progress for status."""

        class _Ctx:
            def __enter__(self_inner) -> TcpModemListenerController:
                self._session_lock.acquire()
                self._session_in_progress = True
                return self

            def __exit__(self_inner, *args: Any) -> None:
                self._session_in_progress = False
                self._session_lock.release()

        return _Ctx()


_modem_listener_singleton: Optional[TcpModemListenerController] = None
_singleton_lock = threading.Lock()


def get_tcp_modem_listener() -> TcpModemListenerController:
    global _modem_listener_singleton
    with _singleton_lock:
        if _modem_listener_singleton is None:
            _modem_listener_singleton = TcpModemListenerController()
        return _modem_listener_singleton


def build_last_tcp_listener_trigger_record(
    *,
    operation: str,
    remote_endpoint: Optional[str],
    envelope: Any,
    socket_teardown: str,
) -> dict[str, Any]:
    """
    Operator-facing snapshot after a tcp-listener trigger returns.
    `mvpAmiStages` is populated from failed envelopes' error.details when present.
    """
    diags = getattr(envelope, "diagnostics", None)
    err = getattr(envelope, "error", None)
    details = getattr(err, "details", None) if err is not None else None
    mvp_stages: Optional[list[dict[str, Any]]] = None
    if isinstance(details, dict):
        raw = details.get("mvpAmiDiagnostics")
        if isinstance(raw, list):
            mvp_stages = []
            for item in raw:
                if not isinstance(item, dict):
                    continue
                mvp_stages.append(
                    {
                        "stage": item.get("stage"),
                        "success": item.get("success"),
                        "message": item.get("message"),
                    }
                )

    def _stage_ok(name: str) -> Optional[bool]:
        if not mvp_stages:
            return None
        for s in mvp_stages:
            if s.get("stage") == name:
                return bool(s.get("success"))
        return None

    basic_summary: Optional[dict[str, Any]] = None
    if operation == "readBasicRegisters":
        payload = getattr(envelope, "payload", None)
        regs = getattr(payload, "registers", None) if payload is not None else None
        if isinstance(regs, dict):
            total = len(regs)
            ok_count = 0
            for r in regs.values():
                ev = getattr(r, "error", None)
                val = (getattr(r, "value", None) or "").strip()
                if ev is None and val:
                    ok_count += 1
            basic_summary = {
                "total": total,
                "okCount": ok_count,
                "partial": total > 0 and 0 < ok_count < total,
                "allFailed": total > 0 and ok_count == 0,
            }

    obis_selection_summary: Optional[dict[str, Any]] = None
    if operation == "readObisSelection":
        payload = getattr(envelope, "payload", None)
        rows = getattr(payload, "rows", None) if payload is not None else None
        if isinstance(rows, list):
            total = len(rows)
            ok_c = sum(1 for r in rows if getattr(r, "status", None) == "ok")
            unsupp = sum(1 for r in rows if getattr(r, "status", None) == "unsupported")
            err_c = sum(1 for r in rows if getattr(r, "status", None) == "error")
            obis_selection_summary = {
                "rowCount": total,
                "okCount": ok_c,
                "unsupportedCount": unsupp,
                "errorCount": err_c,
            }

    d_out: dict[str, Any] = {
        "operation": operation,
        "finishedAtUtc": getattr(envelope, "finishedAt", None),
        "transportMode": "tcp_inbound",
        "remoteEndpoint": remote_endpoint,
        "ok": bool(getattr(envelope, "ok", False)),
        "detailCode": getattr(diags, "detailCode", None) if diags is not None else None,
        "message": (getattr(envelope, "message", None) or "")[:500],
        "socketTeardown": socket_teardown,
        "diagnosticsSummary": {
            "transportAttempted": getattr(diags, "transportAttempted", None) if diags else None,
            "associationAttempted": getattr(diags, "associationAttempted", None) if diags else None,
            "verifiedOnWire": getattr(diags, "verifiedOnWire", None) if diags else None,
            "capabilityStage": getattr(diags, "capabilityStage", None) if diags else None,
        },
        "mvpAmiStages": mvp_stages,
        "hints": {
            "iecPhase": _stage_ok("initial_request"),
            "tcpPhase1Runtime": _stage_ok("phase1_runtime_tcp"),
            "association": _stage_ok("association"),
            "readObis": _stage_ok("read_obis"),
        },
        "basicRegistersSummary": basic_summary,
        "obisSelectionSummary": obis_selection_summary,
    }
    if err is not None:
        d_out["errorCode"] = getattr(err, "code", None)
    return d_out
