# Association-view discovery (`discover-supported-obis`)

## Purpose

**One dedicated operation** to read the meter’s **current association object list** (COSEM objects exposed in the active AA), **not** a scan of all standard OBIS codes.

- Use **occasionally** after install, profile changes, or firmware updates.
- **Do not** call this on every routine poll — prefer **reusing a saved snapshot** as the **capability catalog** for targeted reads; run **`read-identity`** / **`read-basic-registers`** often, but **do not** re-run full discovery each cycle.
- **Discovery** = explicit, infrequent. **Snapshots** = source of truth for whether a meter lists required OBIS. **Routine reads** = same targeted OBIS every poll — the internal Next path **validates** against the latest snapshot before calling the sidecar (see below).

## Protocol source

1. Same **serial** path as other MVP-AMI flows: open port → IEC → DLMS baud → **Gurux HDLC association** (broadcast SNRM first if enabled in MVP-AMI config, else legacy SNRM/AARQ via `associate_gurux_client_serial`).
2. **Gurux** `GXDLMSAssociationLogicalName` at logical name **`SUNRISE_RUNTIME_DISCOVERY_ASSOCIATION_LN`** (default **`0.0.40.0.0.255`**).
3. **GET attribute 2** (object list). Gurux decodes into `objectList`; Sunrise normalizes rows in `app/catalog/discovery_normalize.py`.

Unknown or missing fields stay **honest** (no invented manufacturer labels).

## Python — live discovery

- **POST** `/v1/runtime/discover-supported-obis`  
  Body: same as read-identity (`meterId`, optional `channel` for serial override).
- **Envelope:** `operation: "discoverSupportedObis"`, `payload` = `DiscoverSupportedObisPayload`.
- **`simulated: false`** on `mvp_ami` when the object list was read successfully after association.
- Failures: `error.code` such as `SERIAL_OPEN_FAILED`, `IEC_HANDSHAKE_FAILED`, `ASSOCIATION_FAILED`, `ASSOCIATION_VIEW_READ_FAILED`, `DISCOVERY_RUNTIME_ERROR`; details include `sunDiscoveryDiagnostics`.

### Autosave (on-wire success only)

When discovery **succeeds** with **`simulated: false`** (real `mvp_ami` path), the sidecar **writes a JSON snapshot** unless disabled:

| Env | Meaning |
| --- | ------- |
| `SUNRISE_RUNTIME_DISCOVERY_ASSOCIATION_LN` | Association LN to read (default `0.0.40.0.0.255`) |
| `SUNRISE_RUNTIME_DISCOVERY_SNAPSHOT_DIR` | Root directory (default: `apps/runtime-python/data/discovery-snapshots`) |
| `SUNRISE_RUNTIME_DISCOVERY_SNAPSHOT_AUTOSAVE` | `true` / `false` (default `true`) |
| `SUNRISE_RUNTIME_DISCOVERY_SNAPSHOT_MAX_HISTORY` | Max history files per meter (default `32`) |

**Stub / simulated** discovery does **not** persist (avoids fake catalogs on disk). Autosave errors are **logged** only; the HTTP response still succeeds.

Layout per meter:

- `{dir}/{meterId}/latest.json` — overwritten each successful save  
- `{dir}/{meterId}/history/{timestamp}.json` — append-only history (trimmed by `MAX_HISTORY`)

## Python — read persisted snapshots

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/v1/runtime/discovery-snapshots/{meterId}/latest` | Full `DiscoverySnapshotRecord` JSON |
| `GET` | `/v1/runtime/discovery-snapshots/{meterId}` | `{ meterId, snapshots: [{ capturedAtUtc, storedAs }] }` |

Same Bearer auth as other `/v1/*` routes when `SUNRISE_RUNTIME_SERVICE_TOKEN` is set.

### Snapshot record shape (`schemaVersion: "1"`)

- `meterId`, `capturedAtUtc`, `associationLogicalName`, `totalCount`, `objects[]`, `source`
- `profileFingerprint` — SHA-256 over adapter + association LN + MVP-AMI config file bytes + root path (detect config/profile drift)
- `simulated`, `runtimeAdapter`
- `channelContext` — optional `type`, `devicePath`, etc. from the discovery request
- `discoveryFinishedAt` — envelope `finishedAt` from the discovery call

## Next.js (internal)

| Route | Proxies to |
| ----- | ---------- |
| `POST` `/api/internal/python-runtime/discover-supported-obis` | Live discovery |
| `GET` `/api/internal/python-runtime/discovery-snapshots/[meterId]/latest` | Latest snapshot |
| `GET` `/api/internal/python-runtime/discovery-snapshots/[meterId]` | Snapshot index |

Requires `RUNTIME_PYTHON_SIDECAR_URL` (and token alignment with other internal proxies).

## Catalog-guarded `read-basic-registers` (Next internal only)

The **Python** runtime endpoints stay capable of executing reads directly (e.g. `POST /v1/runtime/read-basic-registers` for break-glass or tooling).

The **Next internal** proxies apply a **pre-flight catalog check** so the control plane does not assume OBIS support blindly:

| Route | Behavior |
| ----- | -------- |
| `POST` `/api/internal/python-runtime/read-basic-registers` | Loads latest snapshot via the sidecar; requires every OBIS in `SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS` (Next server env, **same default as Python**) to appear in `objects[]`. If **no snapshot** → **409** `CATALOG_READ_BLOCKED`, `decision: "no_snapshot"`. If **snapshot missing OBIS** → **409**, `decision: "incompatible"` + `missingObis`. If **allowed** → proxies to Python; response includes `catalogCompatibility` diagnostics. |
| `POST` `/api/internal/python-runtime/jobs/read-basic-registers` | Same gate before enqueue (**409** if blocked; **202** includes `catalogCompatibility` when queued). |

Diagnostics field: `catalogCompatibility` (`decision`, `requiredObis`, `supportedObisInSnapshot`, `missingObis`, `snapshotSummary`, `message`).

Set **`SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS`** on the **Next** process to match the sidecar if you override defaults on one side only.

## Payload shape (live discovery success)

Same as `DiscoverSupportedObisPayload` in the runtime envelope; persisted record embeds that plus provenance fields above.

## Files

| Area | Path |
| ---- | ---- |
| Discovery pipeline | `app/adapters/mvp_ami_discovery.py` |
| Gurux associate (client capture) | `app/adapters/mvp_ami_gurux_session.py` |
| Row normalization | `app/catalog/discovery_normalize.py` |
| File persistence | `app/catalog/discovery_snapshot_store.py` |
| Persisted schema | `app/schemas/discovery_snapshot.py` |
| Autosave hook | `app/services/discover_supported_obis.py` |
| Snapshot HTTP routes | `app/routes/discovery_snapshots_v1.py` |

## Future catalog management

- Central DB / object storage, multi-node replication, snapshot retention policies, and **diffing** catalogs across `profileFingerprint` changes are **out of scope** for this step.
