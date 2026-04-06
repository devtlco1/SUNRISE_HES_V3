# Smart meter runtime boundary (v1)

## Purpose

This layer defines **typed contracts** and a **replaceable adapter** between the HES application (dashboard, future job runners) and **smart-meter runtime operations** (probe, association, reads, relay-oriented workflows).

It exists **before** any verified live DLMS/COSEM transport so that:

- API and domain shapes stay stable while the implementation moves from **stub → real protocol**.
- UI and aggregation code do not need to be rewritten when a real adapter is introduced.
- All current behavior is explicitly **simulated** and traceable to `data/runtime-simulator.json`.

## Current status: stub only

- **No** on-air meter communication, **no** sockets, **no** Gurux/DLMS stack in this repository path.
- The default adapter is **`StubRuntimeAdapter`**, resolved by `lib/runtime/runtime-factory.ts`.
- Every successful stub response sets **`simulated: true`** and uses operational messages that state the outcome is **simulator-backed**.

Relay disconnect/reconnect routes exist for **contract completeness** only. They return **simulated acceptance** and **do not** imply a physical relay or service switch change.

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

All action routes expect a JSON body:

```json
{
  "meterId": "hes-mt-10021",
  "endpointId": "optional-string",
  "channelHint": "optional-string"
}
```

Invalid JSON or body shape → **400** with `{ error, message? }`. Adapter resolution misconfiguration → **500** with `RUNTIME_CONFIG` where applicable.

## Response envelope conventions

Successful responses follow `RuntimeResponseEnvelope` in `types/runtime.ts`:

- `ok` — overall success of the operation (stub uses `true` for happy path).
- `simulated` — **`true`** for all current stub outcomes.
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

1. Implement a new class that satisfies `SmartMeterRuntimeAdapter` using the real stack (e.g. HDLC, application association, COSEM reads).
2. Set **`simulated: false`** on responses that reflect **verified** on-wire results (and keep `true` only for dry-run or lab modes if ever needed).
3. Extend envelopes with real **`error`** codes (timeouts, NACK, security rejections) without breaking existing fields.
4. Wire `getRuntimeAdapter()` in `runtime-factory.ts` to select the real implementation via environment or deployment config.
5. Keep **HTTP route handlers thin** — they should only validate input, call the adapter, and return JSON.

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
- `lib/runtime/runtime-factory.ts` — adapter resolution.
- `lib/runtime/post-action.ts` — shared POST wiring for API routes.
- `data/runtime-simulator.json` — stub data only.
