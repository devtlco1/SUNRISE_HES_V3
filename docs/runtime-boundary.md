# Smart meter runtime boundary (v1)

## Purpose

This layer defines **typed contracts** and a **replaceable adapter** between the HES application (dashboard, future job runners) and **smart-meter runtime operations** (probe, association, reads, relay-oriented workflows).

It exists **before** any verified live DLMS/COSEM transport so that:

- API and domain shapes stay stable while the implementation moves from **stub → real protocol**.
- UI and aggregation code do not need to be rewritten when a real adapter is introduced.
- All current behavior is explicitly **simulated** and traceable to `data/runtime-simulator.json`.

## Current status (pre-hardware)

- **No** verified on-air meter communication, **no** sockets, **no** Gurux/DLMS execution in this repository path.
- **Default adapter:** **`StubRuntimeAdapter`** via `lib/runtime/runtime-factory.ts` when `RUNTIME_ADAPTER` is unset or `stub`.
- **Stub:** successful paths return **`simulated: true`** and messages that state outcomes are **simulator-backed** (`data/runtime-simulator.json`).
- **Real adapter skeleton:** `lib/runtime/real-runtime-adapter.ts` implements the same interface but returns **`ok: false`**, **`simulated: false`**, and **`REAL_ADAPTER_NOT_WIRED`** — explicitly **not** live hardware.

Relay disconnect/reconnect (stub) return **simulated acceptance** only; they **do not** imply a physical relay change. The skeleton relay methods return the same **not-wired** envelope as other operations.

## Adapter selection

Environment variable **`RUNTIME_ADAPTER`**:

- **`stub`** or unset → `StubRuntimeAdapter`.
- **`real`** or **`dlms`** → `RealRuntimeAdapter` (skeleton; **no** transport).
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

- `ok` — stub success paths use `true`; the real **skeleton** uses `false` for every operation until transport exists.
- `simulated` — **`true`** on stub simulator outcomes; **`false`** on the skeleton (means “not stub,” **not** “verified hardware”).
- `operation` — discriminant matching the logical operation name.
- `meterId` — echoed target identifier.
- `startedAt` / `finishedAt` — ISO-8601 timestamps.
- `durationMs` — elapsed wall time for the handler (stub includes a small bounded delay for realism).
- `message` — human-readable, **non-deceptive** description (simulator wording).
- `transportState` / `associationState` — high-level state hints for UI/diagnostics (stub uses consistent simulated values).
- `payload` — operation-specific data (`ProbeConnectionPayload`, `IdentityPayload`, etc.).
- `error` — optional structured error; reserved for future real adapters and failure paths.

Types are mirrored in `lib/runtime/contracts.ts` (including the simulator file shape) and the adapter interface in `lib/runtime/runtime-adapter.ts`.

## What must change for real DLMS integration

1. Implement transport and COSEM logic (e.g. HDLC, application association, reads) **inside** `RealRuntimeAdapter` or a dedicated module it calls — replace the skeleton `not-wired` returns with real outcomes.
2. On **verified** on-wire success, return **`ok: true`**, **`simulated: false`**, and populate **`payload`**. Use **`simulated: true`** only for deliberate lab/dry-run modes if needed.
3. Extend envelopes with real **`error`** codes (timeouts, NACK, security rejections) without breaking existing fields.
4. Keep **`getRuntimeAdapter()`** selecting **`real`** when `RUNTIME_ADAPTER=real` (or introduce additional modes if required).
5. Keep **HTTP route handlers thin** — validate input, call the adapter, return JSON.

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
- `lib/runtime/real-runtime-adapter.ts` — skeleton (not-wired) implementation.
- `lib/runtime/adapter-mode.ts` — env parsing and status DTO for `GET /api/runtime/status`.
- `lib/runtime/runtime-factory.ts` — adapter resolution.
- `lib/runtime/post-action.ts` — shared POST wiring for API routes.
- `app/api/runtime/status/route.ts` — adapter status (dev).
- `app/dev/runtime/page.tsx` — internal harness entry.
- `components/dev/dev-runtime-harness.tsx` — harness client UI.
- `lib/dev/runtime-harness-allowed.ts` — production gate for `/dev/runtime`.
- `data/runtime-simulator.json` — stub data only.
- `docs/runtime-dev-harness.md` — how to use the harness.
