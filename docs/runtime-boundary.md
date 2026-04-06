# Smart meter runtime boundary (v1)

## Post–VPS note (inbound TCP ingress)

Live inbound TCP experiments reached **strict UA** and **Gurux-aligned AARQ** with **no post-AARQ RX** in both auto and staged modes — see **`docs/runtime-ingress.md`** and the architecture handoff **`docs/protocol-runtime-handoff.md`**. The **stub/real adapter** contracts below remain the right **UI-facing** shape; **on-wire execution** for production reads should move toward a **separate protocol service** (e.g. Python/MVP-AMI-class sidecar) rather than further ingress tuning in this repo.

A **Python FastAPI sidecar** lives under **`apps/runtime-python/`**; Next.js can proxy synchronous reads, **association-view discovery** and **persisted discovery snapshots** (`/api/internal/python-runtime/discover-supported-obis`, `/api/internal/python-runtime/discovery-snapshots/...`), and **v1 async read jobs** (`/api/internal/python-runtime/jobs/*`) when **`RUNTIME_PYTHON_SIDECAR_URL`** is set — see **`docs/architecture-control-plane-python.md`**, **`docs/runtime-python-discovery.md`**, and **`docs/job-queue-foundation.md`** (v1 queue is in-process / not durable).

## Purpose

This layer defines **typed contracts** and a **replaceable adapter** between the HES application (dashboard, future job runners) and **smart-meter runtime operations** (probe, association, reads, relay-oriented workflows).

It exists **before** any verified live DLMS/COSEM transport so that:

- API and domain shapes stay stable while the implementation moves from **stub → real protocol**.
- UI and aggregation code do not need to be rewritten when a real adapter is introduced.
- Stub behavior is explicitly **simulated** and traceable to `data/runtime-simulator.json`; the real adapter may perform **on-wire** steps when configured (see status below).

## Current status (DLMS association staged)

- **`verifiedOnWire: true`** is set **only** when the **real** adapter parses an on-wire **AARE** with **association-result = 0** (accepted). TCP-only probe success **never** sets it.
- **Default adapter:** **`StubRuntimeAdapter`** when `RUNTIME_ADAPTER` is unset or `stub`.
- **Stub:** **`simulated: true`**, **`diagnostics.outcome: simulated_success`**, **`verifiedOnWire: false`**; data from **`data/runtime-simulator.json`**.
- **Real adapter (`RealRuntimeAdapter`):** modular code under **`lib/runtime/real/`**.
  - **Probe:** optional **TCP** to **`RUNTIME_PROBE_HOST`** + **`RUNTIME_PROBE_PORT`**. Success ⇒ **`transport_reachable_unverified`**, **`verifiedOnWire: false`**.
  - **Associate:** **HDLC** SNRM → UA → **I-frame** with LLC + **AARQ** (LN, no dedicated security in the emitted AARQ). Parses **AARE** for **association-result**. **`verified_on_wire_success`** + **`verifiedOnWire: true`** only when result **0**. Wrong peer, encryption required, address mismatch, or non-standard framing ⇒ **`attempted_failed`** with explicit **`detailCode`**. Link closed with **DISC** after the attempt (no session held for reads).
  - **Read identity / clock / registers / relay:** still **`not_implemented`** on the real path.

Relay (stub) remains **simulated acceptance** only. Real relay methods return **`not_implemented`**.

## Adapter selection

Environment variable **`RUNTIME_ADAPTER`**:

- **`stub`** or unset → `StubRuntimeAdapter`.
- **`real`** or **`dlms`** → `RealRuntimeAdapter` (TCP probe + **HDLC/AARQ–AARE** associate when transport env set; reads/relay not implemented).
- **Unknown value** → fallback to stub + server warning; see **`GET /api/runtime/status`** for `configuredMode: "unknown"`.

## Developer harness

Internal UI: **`/dev/runtime`** (see **`docs/runtime-dev-harness.md`**). Gated in production unless **`ALLOW_DEV_RUNTIME_HARNESS`** is set. Not linked from the main operational sidebar.

## Supported operations

| Operation            | HTTP route                                      | Adapter method          |
| -------------------- | ----------------------------------------------- | ----------------------- |
| Probe connection     | `POST /api/runtime/probe`                       | `probeConnection`       |
| Associate            | `POST /api/runtime/associate`                   | `associate`             |
| Read identity        | `POST /api/runtime/read-identity`               | `readIdentity`          |
| Read clock           | `POST /api/runtime/read-clock`                  | `readClock`             |
| Read basic registers | `POST /api/runtime/read-basic-registers`        | `readBasicRegisters`    |
| Relay disconnect     | `POST /api/runtime/relay-disconnect`            | `disconnectRelay`       |
| Relay reconnect      | `POST /api/runtime/relay-reconnect`             | `reconnectRelay`        |
| Adapter status (dev) | `GET /api/runtime/status`                       | _(none — metadata only)_ |

All **action** routes expect a JSON body:

```json
{
  "meterId": "hes-mt-10021",
  "endpointId": "optional-string",
  "channelHint": "optional-string"
}
```

Invalid JSON or body shape → **400** with `{ error, message? }`. Unexpected server/adapter throws → **500** with `{ error, message? }`.

**`GET /api/runtime/status`** — read-only JSON describing configured vs effective adapter and whether responses are simulator-backed (for dev tooling).

## Response envelope conventions

Responses follow `RuntimeResponseEnvelope` in `types/runtime.ts`:

- `ok` — stub success paths use `true`; real adapter uses `true` only for **TCP probe success** (still not DLMS-verified); otherwise `false` for not-implemented / failed probe.
- `simulated` — **`true`** on stub; **`false`** on real path (means “not stub,” **not** “verified hardware”).
- `operation` — discriminant matching the logical operation name.
- `meterId` — echoed target identifier.
- `startedAt` / `finishedAt` — ISO-8601 timestamps.
- `durationMs` — elapsed wall time for the handler (stub includes a small bounded delay for realism).
- `message` — human-readable, **non-deceptive** description.
- `transportState` / `associationState` — high-level hints (real TCP probe success may use `transportState: connected` without association).
- `payload` — operation-specific data; probe includes **`probeKind`**: `simulator` | `tcp_socket` | `none`.
- `error` — structured error when `ok: false` (stable `code` values on the real adapter).
- **`diagnostics`** (optional but set by current adapters) — **`RuntimeExecutionDiagnostics`**: `outcome`, `capabilityStage`, `transportAttempted`, `associationAttempted`, **`verifiedOnWire`**, optional `detailCode`. Use this for staging and the dev harness.

Types are mirrored in `lib/runtime/contracts.ts` (including the simulator file shape) and the adapter interface in `lib/runtime/runtime-adapter.ts`.

## What must change for real DLMS integration

1. Extend **`lib/runtime/real/`** (e.g. HDLC, `association-stage.ts`, `cosem-reads-stage.ts`) — replace **`not_implemented`** returns with real protocol flows.
2. When the stack can **prove** a COSEM/DLMS result, set **`diagnostics.verifiedOnWire: true`**, **`diagnostics.outcome: verified_on_wire_success`**, and populate **`payload`** with meter-sourced data. Until then, keep **`verifiedOnWire: false`**.
3. Keep **`error`** / **`detailCode`** stable and specific (timeouts, NACK, security rejections).
4. Relay: implement only after reads and policy gates; update **`relay-stage.ts`** last.
5. Keep **HTTP route handlers thin** — validate input, call the adapter, return JSON.

## Next milestone after association

Reuse a **persistent** HDLC session (or reconnect policy) and implement **read identity** (GET / LN) in `cosem-reads-stage.ts`, setting **`verifiedOnWire`** only when COSEM response bytes are parsed as a real meter-sourced value.

Do **not** couple DLMS types to React components; keep protocol details inside the adapter implementation.

## Recommended first real hardware validation order

1. **Probe connection** — link up, round-trip, and basic reachability.
2. **Association** — application context and security as required by the meter.
3. **Read identity** — serial, logical device name, firmware sanity check.
4. **Read clock** — time sync and skew policy.
5. **Read basic registers** — a small, agreed OBIS set before expanding.
6. **Relay control** — only after reads are stable; treat as high-risk and policy-gated.

## Files (reference)

- `types/runtime.ts` — domain types and envelope.
- `lib/runtime/contracts.ts` — request validation, simulator JSON typing.
- `lib/runtime/runtime-adapter.ts` — adapter interface.
- `lib/runtime/stub-runtime-adapter.ts` — deterministic stub.
- `lib/runtime/real-runtime-adapter.ts` — real adapter façade (delegates to `lib/runtime/real/*`).
- `lib/runtime/real/` — transport config, TCP probe, **HDLC + AARQ/AARE** associate, COSEM/relay placeholders, envelope helpers.
- `lib/runtime/adapter-mode.ts` — env parsing and status DTO for `GET /api/runtime/status`.
- `lib/runtime/runtime-factory.ts` — adapter resolution.
- `lib/runtime/post-action.ts` — shared POST wiring for API routes.
- `app/api/runtime/status/route.ts` — adapter status (dev).
- `app/dev/runtime/page.tsx` — internal harness entry.
- `components/dev/dev-runtime-harness.tsx` — harness client UI.
- `lib/dev/runtime-harness-allowed.ts` — production gate for `/dev/runtime`.
- `data/runtime-simulator.json` — stub data only.
- `docs/runtime-dev-harness.md` — how to use the harness.
