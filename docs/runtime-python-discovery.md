# Association-view discovery (`discover-supported-obis`)

## Purpose

**One dedicated operation** to read the meter’s **current association object list** (COSEM objects exposed in the active AA), **not** a scan of all standard OBIS codes.

- Use **occasionally** after install, profile changes, or firmware updates.
- **Do not** call this on every routine poll — prefer targeted `read-identity` / `read-basic-registers` (or future cached OBIS lists).
- Results are ideal to **cache per** `(meter model, firmware, security profile)` once you add persistence (see below).

## Protocol source

1. Same **serial** path as other MVP-AMI flows: open port → IEC → DLMS baud → **Gurux HDLC association** (broadcast SNRM first if enabled in MVP-AMI config, else legacy SNRM/AARQ via `associate_gurux_client_serial`).
2. **Gurux** `GXDLMSAssociationLogicalName` at logical name **`SUNRISE_RUNTIME_DISCOVERY_ASSOCIATION_LN`** (default **`0.0.40.0.0.255`**).
3. **GET attribute 2** (object list). Gurux decodes into `objectList`; Sunrise normalizes rows in `app/catalog/discovery_normalize.py`.

Unknown or missing fields stay **honest** (no invented manufacturer labels).

## Python

- **POST** `/v1/runtime/discover-supported-obis`  
  Body: same as read-identity (`meterId`, optional `channel` for serial override).
- **Envelope:** `operation: "discoverSupportedObis"`, `payload` = `DiscoverSupportedObisPayload`.
- **`simulated: false`** on `mvp_ami` when the object list was read successfully after association.
- Failures: `error.code` such as `SERIAL_OPEN_FAILED`, `IEC_HANDSHAKE_FAILED`, `ASSOCIATION_FAILED`, `ASSOCIATION_VIEW_READ_FAILED`, `DISCOVERY_RUNTIME_ERROR`; details include `sunDiscoveryDiagnostics`.

| Env | Meaning |
| --- | ------- |
| `SUNRISE_RUNTIME_DISCOVERY_ASSOCIATION_LN` | Association LN to read (default `0.0.40.0.0.255`) |

## Next.js (internal)

- **POST** `/api/internal/python-runtime/discover-supported-obis`  
  Requires `RUNTIME_PYTHON_SIDECAR_URL` (and token alignment with other internal proxies).

## Payload shape (success)

```json
{
  "associationLogicalName": "0.0.40.0.0.255",
  "totalCount": 42,
  "source": "gurux_association_ln_object_list_attr2",
  "objects": [
    {
      "classId": 3,
      "obis": "1.0.1.8.0.255",
      "version": 0,
      "classIdName": "ObjectType.REGISTER",
      "shortName": 12345
    }
  ]
}
```

(`classIdName` / `shortName` / `description` appear only when Gurux provides them.)

## Caching / persistence (not in v1)

- **v1:** Response only; nothing written to disk or DB.
- **Later:** Implement storage keyed by meter id + profile hash; `app/catalog/snapshot_placeholder.py` documents the intended hook.

## Files

| Area | Path |
| ---- | ---- |
| Discovery pipeline | `app/adapters/mvp_ami_discovery.py` |
| Gurux associate (client capture) | `app/adapters/mvp_ami_gurux_session.py` |
| Row normalization | `app/catalog/discovery_normalize.py` |
| Future snapshot hook | `app/catalog/snapshot_placeholder.py` |
