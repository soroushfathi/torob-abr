# Torob Cloud / ترب ابر

Torob Cloud is a Persian RTL infrastructure advisor for Iranian cloud services. It turns project requirements into a hosting package with explicit assumptions, pricing evidence, alternatives, and saved recommendation reports.

The application runs locally on Windows. PostgreSQL, pricing collection, and monitoring support services are reached through a private SSH tunnel.

## Presentation and demo

- [Google Slides — project presentation](https://docs.google.com/presentation/d/1Qdq7st7JJJ5rYhiINLabIEpMJjSw3czeBe4WgZ7ECXQ/edit?usp=drive_link)
- [Demo video — Google Drive](https://drive.google.com/file/d/1v49TlYwVV9WxKCYtOoYjlhXhNiiPBmRr/view?usp=drive_link)

These resources retain their existing Google sharing permissions.

## Product capabilities

- Capture requirements, operational capability, budget range, availability needs, and file-storage requirements.
- Recommend infrastructure packages with rule identifiers, assumptions, unknown costs, and alternatives.
- Compare fixed plans and explicit metered configurations while preserving original pricing evidence.
- Save projects, selections, procurement checklists, and immutable report snapshots.
- Review pricing collection and publication candidates through a separate administrator role.
- Inspect read-only incident evidence for database, latency, and resource issues.

The advisor uses deterministic rules. Live AI, commercial conversions, revenue attribution, and measured diagnosis accuracy are unavailable. Verification events remain separate from user activity.

## Architecture

| Component | Implementation |
| --- | --- |
| Browser | Static HTML/CSS/JavaScript in `public/`, Persian RTL, self-hosted IRANYekanX |
| API | Node.js 24+, Express 5, Zod validation; binds to `127.0.0.1:3100` |
| Advisor | Requirements, rules, package assembly, and option selection in `src/advisor/` |
| Pricing | Catalog versions, evidence, decimal estimates, and admin routes in `src/pricing/` |
| Persistence | PostgreSQL `torob_cloud`; separate application, migration, analytics, and pricing roles |
| Collection | Bounded Python adapters and a dedicated support worker in `infra/pricing/` |
| Monitoring | Authenticated telemetry gateway, Prometheus, Grafana, and read-only SQL aggregates |

The existing `xdo-new` SSH alias provides these loopback forwards:

| Local endpoint | Remote endpoint | Purpose |
| --- | --- | --- |
| `127.0.0.1:15432` | `127.0.0.1:5432` | PostgreSQL |
| `127.0.0.1:19100` | `127.0.0.1:19100` | Telemetry |
| `127.0.0.1:13300` | `127.0.0.1:3300` | Grafana |

## Local setup

Prerequisites: Node.js 24+, npm, PowerShell, Python 3 for setup helpers, and authorized SSH access through `xdo-new`. A fresh clone does not provision the remote infrastructure.

```powershell
cd D:\Projects\torob-abr
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-fonts.ps1
```

The font script copies the user-provided package from `D:\Projects\ForoushYar\IRANYekanX(Pro)`. Font binaries are ignored by Git; no font CDN is used.

Use `.env.example` as the configuration reference. On the existing authorized environment, initialize local credentials with:

```powershell
python scripts/configure-local.py
python scripts/configure-pricing-local.py
```

The first helper refuses to overwrite an existing `.env`; the pricing helper adds missing pricing settings. Secrets belong in the ignored local `.env` or server-side configuration, never in browser assets or Git. The administrator key must differ from the user key.

Start the tunnel in one terminal and keep it running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tunnel.ps1
```

Start the app in a second terminal:

```powershell
npm run dev
```

Open [the local application](http://127.0.0.1:3100/). Use `npm start` without file watching. Avoid duplicate listeners; the tunnel exits on forwarding conflicts.

### Schema updates

Inspect pending migrations and back up the dedicated database following the [operations runbook](docs/operations.md), then apply:

```powershell
npm run migrate
```

The runner verifies recorded SHA-256 checksums, serializes execution with an advisory lock, and applies each pending migration in a transaction. Never edit an already-applied migration.

Migration `006` stores unverified tariff submissions; `007` exposes the restricted public view needed by the catalog. A successful database connectivity check does not prove that all required schema objects exist.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Local HTTP port, default `3100` |
| `DATABASE_URL` | Application PostgreSQL connection |
| `MIGRATION_DATABASE_URL` | Schema-owner connection for migrations |
| `PRICING_ADMIN_DATABASE_URL` | Restricted pricing administrator connection |
| `LOCAL_ACCESS_TOKEN` | Demo user sign-in key |
| `ADMIN_ACCESS_TOKEN` | Separate administrator sign-in/elevation key |
| `TELEMETRY_URL` | Required private endpoint `http://127.0.0.1:19100` |
| `TELEMETRY_TOKEN` | Telemetry authentication secret |
| `GRAFANA_URL` | Forwarded Grafana address |
| `AI_MODE` | Current configuration uses `rules` |

## Sessions and API

Sign-in creates a seven-day HttpOnly cookie session. Projects belong to that session: a new login creates a separate workspace. Switching user/admin mode preserves projects in the current session but reloads the page, discarding unsaved form changes. Logout expires the session without deleting records. This is a demo identity model, not production account management.

| Endpoint | Responsibility |
| --- | --- |
| `GET /api/health` | Database connectivity and latest telemetry status |
| `POST /api/session` | Demo sign-in |
| `POST /api/session/role` | Change role; elevation requires the admin key |
| `POST /api/session/logout` | Expire the session |
| `GET /api/catalog` | Read catalog and pricing evidence |
| `GET, POST /api/projects` | List or create owned projects |
| `POST /api/projects/:id/recommend` | Generate and persist a report |
| `GET /api/projects/:id/reports` | List historical reports |
| `POST /api/projects/:id/select` | Select a report option |
| `GET /api/analytics` | Session-owned event aggregates |
| `GET, POST /api/incidents` | Read or request bounded investigations |

Protected routes require a valid session and enforce ownership. Routes under `/api/admin/*` additionally require the admin role. Full route definitions and validation schemas are in `src/server.js` and `src/pricing/admin.js`.

## Pricing semantics

Fixed plans, metered tariffs, explicit configurations, and estimates are separate concepts. Calculations preserve original currencies and use decimal arithmetic. Missing rates are not zero; budget ranges are not converted to invented midpoints. A known subtotal below a budget does not prove affordability of the complete package.

Published versions and report snapshots preserve historical evidence. User-submitted, unverified tariffs stay separate from verified publication. Failed collection retains the previous version and its real age. See the [pricing runbook](docs/pricing-packages.md), [catalog reference](docs/catalog.md), and [Parspack evidence](docs/parspack-price-verification.md) for coverage and limitations.

## Health and troubleshooting

```powershell
Invoke-RestMethod http://127.0.0.1:3100/api/health
```

Expected healthy values: `status: ok`, `database: connected`, and `telemetry: connected`. Telemetry is periodic and may briefly be pending at startup.

| Symptom | Check |
| --- | --- |
| Local page unreachable | App process and port `3100` |
| Health returns `503` | SSH terminal, authorized connectivity, and listener `15432` |
| Health OK but catalog fails | Migration history, schema objects, and access grants; especially migration `007` |
| Generic service error | This message covers server errors generally; it does not establish a tunnel failure |
| Admin controls unavailable | Separate admin configuration and current session role |
| Previous projects missing after login | New sign-in creates a new session workspace |

Closing the tunnel disconnects database and monitoring access. Stopping the app makes telemetry stale; offline does not mean healthy.

## Monitoring and recovery

The [Grafana folder](http://127.0.0.1:13300/dashboards/f/torob-cloud) is available through the tunnel with the existing authorized Grafana account. Dashboards cover technical signals, product events, recommendation quality, commercial availability, SRE evidence, and pricing collection.

Business panels default to `source=user` and use rolling 30-day SQL windows. Historical verification uses `source=verification`. See [KPI definitions](docs/kpis.md).

Backups target only `torob_cloud`, use PostgreSQL custom-format dumps, and retain seven copies on the same server. Archive validation is not a restore test. Recovery procedures and historical restore evidence are in the [operations runbook](docs/operations.md). Off-site backup and point-in-time recovery are not configured.

## Repository guide

| Path | Contents |
| --- | --- |
| `public/` | Browser interface and ignored local fonts |
| `src/server.js` | HTTP API, sessions, ownership, telemetry |
| `src/advisor/` | Requirements and package recommendation logic |
| `src/pricing/` | Catalog, estimates, pricing evidence, administration |
| `migrations/` | Ordered PostgreSQL migrations |
| `infra/` | Monitoring, worker, backup, and sandbox artifacts |
| `scripts/` | Setup, tunnel, migration, and operations utilities |
| `docs/` | Runbooks, pricing evidence, KPI definitions |
| `test/` | Existing test sources; execution policy below applies |

## Validation policy and current limits

Product tests are paused under the recorded project policy. Do not run unit, integration, E2E, browser journeys, or `npm run verify` without renewed authorization. Syntax checks and essential configuration review remain available. Historical verification is not acceptance of the current revision.

There is no production identity system, full-market pricing coverage, live AI diagnosis, or enabled deployment/remediation executor. Sandbox Compose files and saved plans are reference artifacts. The app cannot execute arbitrary shell commands or access a Docker socket. Database roles do not provide resource isolation from other users of shared PostgreSQL infrastructure.

Public application deployment requires a separate reviewed plan, production authentication, HTTPS, and product acceptance. Current application development stays local.
