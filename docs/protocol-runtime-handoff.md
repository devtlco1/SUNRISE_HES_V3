# Protocol runtime architecture — final recommendation (post–VPS evidence)

This document records the **architecture conclusion** after live experiments on the VPS. It supersedes further investment in **inbound TCP DLMS micro-tweaks** (framing, password, trigger order) for the goal of **verified meter reads**.

## 1. Final architecture conclusion

### What the evidence proved

On the live meter, with inbound TCP:

- TCP accept and listener behavior work.
- **Strict HDLC UA** is observed and accepted; negotiated context is used for AARQ framing.
- Learned meter HDLC address is consistent (e.g. **`00020023`** in the latest trace set).
- **LOW LN AARQ** on the wire matches the **Gurux** reference; **password** on the wire matches configuration (e.g. **`88935860`**).
- A **conservative** AARQ initiate profile was exercised without changing the outcome.
- **`staged_triggered_session`** (API-triggered **IEC → ACK → delay → DLMS**, see `RUNTIME_TCP_METER_INGRESS_SESSION_MODE`) was exercised **without** changing the outcome.

In **both** auto-on-accept and staged/API-triggered models:

- After AARQ, diagnostics show **no meter bytes** in the post-AARQ window (**`post_aarq_zero_rx`** / equivalent hunt outcome).
- The server then completes its own teardown path (**`closeOrigin: closed_after_disc_final`**).

### What the evidence implies

The failure mode is **not** explained by incremental fixes to:

- HDLC/FCS micro-variants already validated through strict UA,
- AARQ/APDU shape (already Gurux-aligned),
- Password encoding (verified on wire),
- Session **trigger order** (staged path did not unlock RX).

Therefore the remaining gap is best treated as **architectural / transport-equivalence**: the **inbound TCP + Next.js–embedded Node** association path is **not** the most credible **primary** integration strategy for **this meter’s** real read contract, even though it is a valuable **diagnostic** surface.

**Explicit statement:** The **inbound TCP listener path** should **not** be treated as the **primary** protocol integration path for production reads until a **separately validated** runtime (see below) proves the same meter responds on a **known-good** session model (e.g. MVP-AMI-class serial or a sidecar that reuses MVP-AMI’s proven stack and ordering). It may remain **optional** for connectivity preview, traces, and future gateways that truly speak that contract.

## 2. Recommended production architecture (primary direction)

**Keep Next.js / TypeScript as the control plane and UI** — dashboards, admin flows, job orchestration metadata, authentication, and **stable HTTP APIs** that the UI already uses.

**Move on-wire DLMS session execution to a dedicated protocol runtime** that:

- Reuses **proven** behavior from **MVP-AMI** (Python, pyserial / Gurux-oriented flows, optional TCP POC patterns where applicable).
- Runs as a **sidecar or separate service** (container or systemd unit), **not** inside the Next.js server process.
- Exposes a **small, versioned contract** to the control plane: connect model, associate, first read, structured errors, health.

**Why this is the best direction now**

- MVP-AMI’s **documented success path** is **host-initiated serial** (and TCP POC is **explicitly** API-triggered with IEC ordering); SUNRISE has shown that **embedding** a parallel TypeScript DLMS state machine on **inbound TCP** still yields **post-AARQ silence** despite **byte-level** alignment with Gurux.
- A **Python sidecar** minimizes reinvention: same reference repo, same operator mental model, faster iteration on **transport** (serial vs TCP client vs gateway) **without** rewriting the dashboard.
- **Process isolation** avoids Next.js worker/multi-bundle quirks, shared global state for TCP, and coupling long-lived sockets to the HTTP server lifecycle.

## 3. Preserving existing frontend / control-plane investment

| Keep in Next.js | Move / delegate to protocol runtime |
| ---------------- | ------------------------------------- |
| UI, auth, routing, existing runtime **status** pages and **envelopes** | Opening serial/TCP to the meter, IEC when required, HDLC/DLMS state machine |
| `GET /api/runtime/status`, ingress **diagnostic** routes (optional, read-only) | Parsing AARE, segmentation, retries tuned per meter family |
| Job **scheduling** metadata, meter registry (IDs, display) | **Verified** associate + first identity read |
| **Contracts** (`RuntimeResponseEnvelope`, operation names) as the **public** shape | Implementation that fills `verifiedOnWire`, `diagnostics`, errors |

**Boundary definition**

- **Control plane:** “what to run, when, for which meter id” + presentation + persistence of **results** (once the sidecar returns structured JSON).
- **Protocol runtime:** “how to talk to the device on a given physical/logical channel” + **all** timing and buffering assumptions.

**Suggested inter-service contract (evolve from existing types)**

- **REST or gRPC** from Next.js **server routes** (or a thin BFF worker) to the sidecar — not from the browser directly.
- Operations mirroring current language: `probe`, `associate`, `readIdentity` — with explicit **`channel`**: `{ type: "serial", device: "..." }` | `{ type: "tcp_client", host, port }` | future gateway modes.
- Responses: reuse **`RuntimeResponseEnvelope`** fields where possible (`ok`, `verifiedOnWire`, `diagnostics`, `error`) so the UI changes are **minimal**.

## 4. Minimum viable sidecar scope (first milestone)

**Goal:** One meter, one channel, one happy path — **no relay**, no full HES read pipeline.

1. **Session open** — configurable serial port (primary) or TCP **client** to a known endpoint (if field topology allows host-initiated TCP).
2. **Association** — reuse MVP-AMI’s proven IEC (if required) + SNRM/UA + AARQ/AARE path for LOW LN as today.
3. **First identity read** — single COSEM GET after accepted association (same OBIS/class/attr as configured in HES).
4. **Status reporting** — JSON: association result, bytes summary (optional), timings, explicit **`post_aarq_rx_bytes`** (even if zero).
5. **Structured errors** — stable `code` / `message`; no silent failures.

**Out of scope for v1:** relay, billing reads, parallel multi-meter scheduling inside the sidecar (orchestration stays in Next.js).

## 5. Migration sequence (no throwaway of current work)

1. **Freeze** further changes to `lib/runtime/ingress/inbound-dlms-session.ts` and related HDLC/AARQ **tuning** for the purpose of “fixing” post-AARQ RX on this meter; keep ingress **enabled only as diagnostics** if useful.
2. **Extract** the **contract** types and HTTP envelope shapes already used by the UI; document them as the **stable** control-plane ↔ sidecar API (may be a copy of `RuntimeResponseEnvelope` in OpenAPI or a shared JSON schema).
3. **Scaffold** the sidecar repo or directory (Python package + Dockerfile + one `associate+readIdentity` CLI or HTTP endpoint).
4. **Replace first:** wire **one** Next.js server action or internal route **`POST /api/runtime/associate`** (behind feature flag) to call the sidecar for **`channel: serial`** (or lab TCP client), leaving stub/real TypeScript adapter for non-flag paths.
5. **Test first:** same physical meter on **serial** via sidecar; compare to MVP-AMI runbook until **`verifiedOnWire: true`** and identity read succeed.
6. **UI:** keep **mock/stub** paths for demos; mark **real** path as “sidecar-backed” in runtime status when flag is on.
7. **Later:** deprecate TypeScript **real** associate for production meters only after sidecar parity; retain TypeScript **probe** if still useful.

## 6. Exact next implementation step

**Implement the Python sidecar skeleton** with:

- One HTTP `POST /v1/session/read-identity` (or equivalent) accepting `{ channel, credentials }` and returning a **`RuntimeResponseEnvelope`-shaped** JSON.
- MVP-AMI code **imported or vendored** for the actual `open_serial` → association → read loop (not a rewrite in TypeScript).

Then validate **serial** against the meter that showed **`post_aarq_zero_rx`** on inbound TCP — that single experiment decides whether the problem is **inbound-TCP-specific** vs **broader**.

---

## References in this repo

- Inbound diagnostics: `docs/runtime-ingress.md`, `GET /api/runtime/ingress/status`.
- Control-plane boundary: `docs/runtime-boundary.md`.
- Topology comparison (API): `status.mvpAmiTopologyComparison`.
- **Python sidecar:** `apps/runtime-python/` (FastAPI — direct reads + **discover-supported-obis** + **file-backed discovery snapshots** under `/v1/runtime/*`, async jobs under `/v1/jobs/*`; `docs/runtime-python-discovery.md`). Next **internal** `read-basic-registers` checks the latest snapshot before proxying (**409** if catalog missing/incompatible). **`read-identity`:** serial; **outbound TCP client** (`docs/runtime-python-tcp-client-read-identity.md`); **inbound modem listener + staged socket + trigger** (`docs/runtime-python-tcp-modem-listener.md`).
- **Next.js → Python proxy (internal):** sync + job enqueue/poll under `app/api/internal/python-runtime/`, `docs/architecture-control-plane-python.md`.
- **Read-job queue (v1):** `docs/job-queue-foundation.md`, `lib/jobs/foundation.ts`, `apps/runtime-python/app/jobs/local_read_job_queue.py`.
