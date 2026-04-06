# VPS / production: real runtime probe (env only)

Field gateway hosts and ports **must not** be committed. Configure them only on the server (PM2, systemd, container env, or a gitignored `.env.production.local`).

## Required variables (real TCP probe)

| Variable | Purpose |
| -------- | ------- |
| `RUNTIME_ADAPTER` | Set to `real` to use the real adapter (TCP probe + staged DLMS associate when implemented). |
| `RUNTIME_PROBE_HOST` | TCP hostname or IP of the **field endpoint** (your value on the server only). |
| `RUNTIME_PROBE_PORT` | TCP port (integer). |
| `RUNTIME_PROBE_TIMEOUT_MS` | Connect timeout (e.g. `5000`). |

Optional (association / HDLC): see `docs/runtime-dev-harness.md` (`RUNTIME_DLMS_*`).

## Semantics (honest)

- **TCP success** ⇒ `diagnostics.outcome: transport_reachable_unverified`, `verifiedOnWire: false`. Not DLMS and not proof of a meter.
- **Associate success** with parsed AARE only sets `verifiedOnWire: true` when the deployed code proves it on-wire.

## Discover how the app runs on the VPS

```bash
# Process
pm2 list
# or
systemctl list-units --type=service | grep -i node
# or
ps aux | grep -E 'next|node'

# Listening port
ss -tlnp | grep node
```

## Apply env (pick one pattern)

### PM2

Use an ecosystem file **on the server** (not committed with secrets) or PM2 env:

```bash
pm2 restart <name> --update-env
```

Ensure the process environment includes the variables above (PM2 `env` / `env_file` pointing to a server-only file).

### systemd

In a drop-in override, use `Environment=` lines or `EnvironmentFile=` pointing to a root-readable file **outside the repo** (e.g. `/etc/sunrise-hes.env`, mode `600`).

After changes: `systemctl daemon-reload && systemctl restart <service>`.

### Shell / manual `next start`

```bash
export RUNTIME_ADAPTER=real
export RUNTIME_PROBE_HOST="<your-host>"
export RUNTIME_PROBE_PORT="<your-port>"
export RUNTIME_PROBE_TIMEOUT_MS=5000
npm run start
```

## Deploy flow (typical)

```bash
cd /path/to/SUNRISE_HES_V3
git fetch origin && git checkout main && git pull --ff-only origin main
git log -1 --oneline
npm ci
npm run lint   # optional on small VPS
npm run build
# restart service (pm2 / systemd / your supervisor)
```

## Validate from the server

Replace `<app-port>` with the port your app listens on (often `3000`).

```bash
curl -sS "http://127.0.0.1:<app-port>/api/runtime/status" | jq .
curl -sS -X POST "http://127.0.0.1:<app-port>/api/runtime/probe" \
  -H 'Content-Type: application/json' \
  -d '{"meterId":"field-test-1"}' | jq .
```

Expect `configuredMode: "real"`, `effectiveAdapter: "real"`, and probe `diagnostics` consistent with TCP outcome—not DLMS proof unless `verifiedOnWire` is true for a proven operation.

## Example template (copy on server only)

See `docs/vps-runtime.env.example` — copy to a **gitignored** file on the VPS and fill in real values there.
