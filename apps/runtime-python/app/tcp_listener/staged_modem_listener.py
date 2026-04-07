"""
Process-local TCP listener: modem dials server → accept → queue unbound sockets.

Default: background auto read-identity (0.0.96.1.0.255) binds the session under canonical serial.
Failed auto sessions become identify_failed for Scanner/manual recovery only.
All inbound actions resolve the socket strictly by selected meter serial — never a generic slot.
"""

from __future__ import annotations

import logging
import socket
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.config import get_settings
from app.tcp_listener.inbound_target_serial import normalize_inbound_target_serial

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
class StagedSocketHold:
    hold_id: str
    sock: socket.socket
    meta: StagedSocketMeta
    """awaiting_auto_identify | identify_failed | auto_bound | manual_bound (latter two when in _bound)."""
    session_state: str = "awaiting_auto_identify"
    identify_error: Optional[str] = None
    binding_source: Optional[str] = None


def _notify_staged_inbound_arrival() -> None:
    try:
        from app.jobs import obis_selection_job_store as _obis_job_store

        _obis_job_store.notify_staged_inbound_arrival()
    except Exception:  # noqa: BLE001
        pass


@dataclass
class TcpModemListenerController:
    """
    One listening socket + FIFO unbound inbound connections + bound sessions keyed by canonical serial.
    Accept enqueues holds; auto-identify (optional) binds to canonical serial; Scanner recovers identify_failed only.
    """

    _stop_event: threading.Event = field(default_factory=threading.Event)
    _thread: Optional[threading.Thread] = None
    _server_sock: Optional[socket.socket] = None
    _holder_lock: threading.Lock = field(default_factory=threading.Lock)
    _session_lock: threading.Lock = field(default_factory=threading.Lock)
    _inbound_operator_lock: threading.Lock = field(default_factory=threading.Lock)
    _inbound_operator_busy: bool = False
    _unbound: deque[StagedSocketHold] = field(default_factory=deque)
    _bound: dict[str, StagedSocketHold] = field(default_factory=dict)
    _last_replacement_reason: Optional[str] = None
    _last_bind_error: Optional[str] = None
    _session_in_progress: bool = False
    _last_tcp_listener_trigger: Optional[dict[str, Any]] = None

    def begin_inbound_operator_action(self) -> bool:
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
                self._close_all_holds_unlocked(reason="listener_shutdown")
            if self._thread is not None:
                self._thread.join(timeout=3.0)
                self._thread = None
        log.info("tcp_modem_listener_stopped")

    def _close_hold_unlocked(self, hold: StagedSocketHold, *, reason: str) -> None:
        try:
            hold.sock.close()
        except Exception:  # noqa: BLE001
            pass
        self._last_replacement_reason = reason

    def _close_all_holds_unlocked(self, *, reason: str) -> None:
        while self._unbound:
            self._close_hold_unlocked(self._unbound.popleft(), reason=reason)
        for _k, hold in list(self._bound.items()):
            self._close_hold_unlocked(hold, reason=reason)
        self._bound.clear()

    def _prune_dead_bound_unlocked(self) -> None:
        dead = [k for k, h in self._bound.items() if not _sock_is_open(h.sock)]
        for k in dead:
            hold = self._bound.pop(k, None)
            if hold is not None:
                self._close_hold_unlocked(hold, reason="bound_socket_dead")

    def _run_accept_loop(self) -> None:
        s = get_settings()
        host = (s.tcp_listener_host or "0.0.0.0").strip()
        port = int(s.tcp_listener_port)
        backlog = max(1, int(s.tcp_listener_backlog))
        max_unbound = max(1, int(s.tcp_listener_unbound_queue_max))
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
            auto_on = bool(s.tcp_listener_auto_identify_enabled)
            hold = StagedSocketHold(
                hold_id=str(uuid.uuid4()),
                sock=conn,
                meta=meta,
                session_state="awaiting_auto_identify" if auto_on else "identify_failed",
                identify_error=None if auto_on else "auto_identify_disabled",
            )
            with self._holder_lock:
                self._unbound.append(hold)
                while len(self._unbound) > max_unbound:
                    old = self._unbound.popleft()
                    self._close_hold_unlocked(old, reason="unbound_queue_overflow")
            log.info("tcp_modem_staged_connection", extra={"remote": f"{rh}:{rp}"})
            _notify_staged_inbound_arrival()
            if auto_on:
                threading.Thread(
                    target=run_auto_identify_for_hold_id,
                    args=(hold.hold_id,),
                    daemon=True,
                    name=f"inbound-auto-{hold.hold_id[:8]}",
                ).start()

        try:
            if self._server_sock is not None:
                self._server_sock.close()
        except Exception:  # noqa: BLE001
            pass
        self._server_sock = None

    def get_status_dict(self) -> dict[str, Any]:
        s = get_settings()
        with self._holder_lock:
            self._prune_dead_bound_unlocked()
            sessions: list[dict[str, Any]] = []
            for i, h in enumerate(self._unbound):
                if not _sock_is_open(h.sock):
                    continue
                label = {
                    "awaiting_auto_identify": "Auto-identifying",
                    "identify_failed": "Manual attention",
                }.get(h.session_state, h.session_state)
                row: dict[str, Any] = {
                    "holdId": h.hold_id,
                    "pendingBind": True,
                    "queueIndex": i,
                    "remoteHost": h.meta.remote_host,
                    "remotePort": h.meta.remote_port,
                    "acceptedAtUtc": h.meta.accepted_at_utc,
                    "localBound": h.meta.local_bound,
                    "sessionState": h.session_state,
                    "operatorLabel": label,
                }
                if h.identify_error:
                    row["identifyError"] = h.identify_error
                sessions.append(row)
            for serial in sorted(self._bound.keys()):
                h = self._bound[serial]
                if not _sock_is_open(h.sock):
                    continue
                src = h.binding_source or "manual"
                bound_state = "auto_bound" if src == "auto" else "manual_bound"
                blabel = "Auto-bound" if src == "auto" else "Scanner bind"
                sessions.append(
                    {
                        "holdId": h.hold_id,
                        "pendingBind": False,
                        "canonicalSerial": serial,
                        "remoteHost": h.meta.remote_host,
                        "remotePort": h.meta.remote_port,
                        "acceptedAtUtc": h.meta.accepted_at_utc,
                        "localBound": h.meta.local_bound,
                        "sessionState": bound_state,
                        "bindingSource": src,
                        "operatorLabel": blabel,
                    }
                )
            ucount = sum(1 for h in self._unbound if _sock_is_open(h.sock))
            awaiting_cnt = sum(
                1
                for h in self._unbound
                if _sock_is_open(h.sock) and h.session_state == "awaiting_auto_identify"
            )
            routable_cnt = sum(
                1
                for h in self._unbound
                if _sock_is_open(h.sock) and h.session_state == "identify_failed"
            )
            bcount = sum(1 for h in self._bound.values() if _sock_is_open(h.sock))
            first_meta: Optional[StagedSocketMeta] = None
            if self._unbound:
                for h in self._unbound:
                    if _sock_is_open(h.sock):
                        first_meta = h.meta
                        break
            if first_meta is None and self._bound:
                for serial in sorted(self._bound.keys()):
                    h = self._bound[serial]
                    if _sock_is_open(h.sock):
                        first_meta = h.meta
                        break
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
            "stagedPresent": (ucount + bcount) > 0,
            "stagedRemoteHost": first_meta.remote_host if first_meta else None,
            "stagedRemotePort": first_meta.remote_port if first_meta else None,
            "stagedAcceptedAtUtc": first_meta.accepted_at_utc if first_meta else None,
            "stagedSocketOpen": (ucount + bcount) > 0,
            "stagedLocalBound": first_meta.local_bound if first_meta else None,
            "lastStagedReplacementReason": rep,
            "sessionTriggerInProgress": bool(self._session_in_progress or self._inbound_operator_busy),
            "lastTcpListenerTrigger": self._last_tcp_listener_trigger,
            "stagedSessions": sessions,
            "unboundInboundCount": ucount,
            "awaitingAutoIdentifyCount": awaiting_cnt,
            "routableUnboundCount": routable_cnt,
            "boundInboundCount": bcount,
        }

    def record_tcp_listener_trigger(self, record: dict[str, Any]) -> None:
        with self._holder_lock:
            self._last_tcp_listener_trigger = record

    def unbound_queue_len(self) -> int:
        with self._holder_lock:
            return sum(1 for h in self._unbound if _sock_is_open(h.sock))

    def routable_unbound_count(self) -> int:
        with self._holder_lock:
            return sum(
                1
                for h in self._unbound
                if _sock_is_open(h.sock) and h.session_state == "identify_failed"
            )

    def awaiting_auto_identify_count(self) -> int:
        with self._holder_lock:
            return sum(
                1
                for h in self._unbound
                if _sock_is_open(h.sock) and h.session_state == "awaiting_auto_identify"
            )

    def _remove_unbound_hold_by_id_unlocked(self, hold_id: str) -> Optional[StagedSocketHold]:
        new_deque: deque[StagedSocketHold] = deque()
        found: Optional[StagedSocketHold] = None
        for h in self._unbound:
            if h.hold_id == hold_id:
                found = h
            else:
                new_deque.append(h)
        self._unbound = new_deque
        return found

    def mark_unbound_identify_failed(self, hold_id: str, message: str) -> None:
        with self._holder_lock:
            for h in self._unbound:
                if h.hold_id == hold_id and h.session_state == "awaiting_auto_identify":
                    h.session_state = "identify_failed"
                    h.identify_error = (message or "")[:500]
                    break
        _notify_staged_inbound_arrival()

    def finalize_auto_bind(self, hold_id: str, canonical_serial: str) -> bool:
        key = normalize_inbound_target_serial(canonical_serial)
        if not key:
            return False
        with self._holder_lock:
            hold = self._remove_unbound_hold_by_id_unlocked(hold_id)
            if hold is None:
                return False
            if hold.session_state != "awaiting_auto_identify":
                self._unbound.append(hold)
                return False
            if not _sock_is_open(hold.sock):
                self._close_hold_unlocked(hold, reason="dead_socket_auto_bind")
                return False
            self._register_bound_unlocked(key, hold, binding_source="auto")
        _notify_staged_inbound_arrival()
        return True

    def snapshot_unbound_hold_for_auto(self, hold_id: str) -> Optional[StagedSocketHold]:
        with self._holder_lock:
            for h in self._unbound:
                if h.hold_id == hold_id and h.session_state == "awaiting_auto_identify":
                    return h
        return None

    def pop_first_routable_unbound(self) -> Optional[StagedSocketHold]:
        """Remove FIFO identify_failed hold (Scanner recovery / verify path)."""
        with self._holder_lock:
            new_d: deque[StagedSocketHold] = deque()
            taken: Optional[StagedSocketHold] = None
            for h in self._unbound:
                if (
                    taken is None
                    and h.session_state == "identify_failed"
                    and _sock_is_open(h.sock)
                ):
                    taken = h
                else:
                    new_d.append(h)
            self._unbound = new_d
            return taken

    def pop_bound_session(self, serial: str) -> Optional[StagedSocketHold]:
        """Remove bound session for canonical serial if present and alive."""
        key = normalize_inbound_target_serial(serial)
        if not key:
            return None
        with self._holder_lock:
            self._prune_dead_bound_unlocked()
            hold = self._bound.pop(key, None)
            if hold is None:
                return None
            if not _sock_is_open(hold.sock):
                self._close_hold_unlocked(hold, reason="bound_socket_dead_on_pop")
                return None
            return hold

    def register_bound_session(
        self,
        canonical_serial: str,
        hold: StagedSocketHold,
        *,
        binding_source: str = "manual",
    ) -> None:
        """Store an open socket under canonical serial; closes any prior bound entry for that serial."""
        key = normalize_inbound_target_serial(canonical_serial)
        if not key:
            with self._holder_lock:
                self._close_hold_unlocked(hold, reason="empty_canonical_serial_bind")
            return
        with self._holder_lock:
            self._register_bound_unlocked(key, hold, binding_source=binding_source)

    def _register_bound_unlocked(
        self, key: str, hold: StagedSocketHold, *, binding_source: str
    ) -> None:
        hold.binding_source = binding_source
        hold.session_state = "auto_bound" if binding_source == "auto" else "manual_bound"
        old = self._bound.pop(key, None)
        if old is not None:
            self._close_hold_unlocked(old, reason="replaced_by_new_bind_same_serial")
        if not _sock_is_open(hold.sock):
            self._close_hold_unlocked(hold, reason="register_dead_socket")
            return
        self._bound[key] = hold

    def close_hold(self, hold: StagedSocketHold, *, reason: str) -> None:
        with self._holder_lock:
            self._close_hold_unlocked(hold, reason=reason)

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


def run_auto_identify_for_hold_id(hold_id: str) -> None:
    """Background: read 0.0.96.1.0.255 on inbound socket and auto-bind (MVP-AMI only)."""
    log_a = logging.getLogger(__name__)
    ctl = get_tcp_modem_listener()
    hold = ctl.snapshot_unbound_hold_for_auto(hold_id)
    if hold is None:
        return
    settings = get_settings()
    if not settings.tcp_listener_enabled or not settings.tcp_listener_auto_identify_enabled:
        ctl.mark_unbound_identify_failed(hold_id, "auto_identify_disabled")
        return

    from app.adapters.factory import get_runtime_adapter
    from app.adapters.mvp_ami_adapter import MvpAmiRuntimeAdapter
    from app.schemas.requests import ReadIdentityRequest
    from app.tcp_listener.inbound_target_serial import INBOUND_AUTO_BIND_METER_ID, normalize_inbound_target_serial

    adapter = get_runtime_adapter()
    if not isinstance(adapter, MvpAmiRuntimeAdapter):
        ctl.mark_unbound_identify_failed(hold_id, "auto_identify_requires_mvp_ami")
        return

    endpoint = f"{hold.meta.remote_host}:{hold.meta.remote_port}"
    req = ReadIdentityRequest(meterId=INBOUND_AUTO_BIND_METER_ID)
    try:
        env = adapter.read_identity_on_accepted_tcp_socket(req, hold.sock, endpoint)
    except Exception as exc:  # noqa: BLE001
        log_a.exception("inbound_auto_identify_exception", extra={"hold_id": hold_id})
        ctl.mark_unbound_identify_failed(hold_id, str(exc)[:200])
        return

    if not env.ok or env.payload is None:
        msg = (env.error.message if env.error else env.message) or "identity_failed"
        ctl.mark_unbound_identify_failed(hold_id, msg[:500])
        return

    canonical = normalize_inbound_target_serial(env.payload.serialNumber)
    if not canonical:
        ctl.mark_unbound_identify_failed(hold_id, "empty_canonical_serial_0.0.96.1.0.255")
        return

    if ctl.finalize_auto_bind(hold_id, canonical):
        log_a.info(
            "inbound_auto_bind_ok",
            extra={"canonical_serial": canonical, "remote": endpoint, "hold_id": hold_id},
        )


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
