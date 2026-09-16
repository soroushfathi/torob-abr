# Torob Cloud / ترب ابر

Private local prototype with a real remote PostgreSQL database and existing Prometheus/Grafana integrations through **`ssh xdo-new`**. The linked repository was empty when this work began. No application has been deployed publicly and nothing has been pushed to GitHub.

## Start on this Windows development machine

Prerequisites: Node.js 24+, Python 3, existing SSH alias/key `xdo-new`. Credentials have already been written into the ignored, ACL-restricted `.env`; do not commit or paste it.

```powershell
cd D:\Projects\torob-abr
npm ci
powershell -ExecutionPolicy Bypass -File scripts/setup-fonts.ps1
# Terminal 1: keep this running
powershell -ExecutionPolicy Bypass -File scripts/tunnel.ps1
# Terminal 2
npm run migrate
npm start
```

Open **http://127.0.0.1:3100**. Sign in using `LOCAL_ACCESS_TOKEN` from the private `.env` file. This is an isolated demo-session login: projects belong to the current cookie session (7 days). A new login creates a separate workspace; preserve the browser cookie to resume that session. This is not a production identity system.

The existing tunnel/application may already be running from setup. Do not start duplicate listeners; `ExitOnForwardFailure` will report conflicts. Closing the tunnel disconnects the database; closing the app marks the development machine offline after 90 seconds plus at most one scrape interval.

For a fresh local checkout with the same authorized SSH alias, run `python scripts/configure-local.py` once to copy **only Torob Cloud's newly created credentials** into a restricted, ignored `.env`. Existing `.env` is never overwritten. Never put secrets in browser source or Git.

## Dashboards (SSH tunnel required)

Use the existing Grafana administrator account. No existing password was changed, exported to the local project, or printed. The new Torob Cloud folder is admin-only. Existing folders and dashboards retain their permissions.

- Folder: http://127.0.0.1:13300/dashboards/f/torob-cloud
- Technical and AI: http://127.0.0.1:13300/d/torob-technical
- Product funnel: http://127.0.0.1:13300/d/torob-product
- Recommendation quality: http://127.0.0.1:13300/d/torob-quality
- Commercial: http://127.0.0.1:13300/d/torob-commercial
- SRE: http://127.0.0.1:13300/d/torob-sre

Business dashboards default to `source=user`; choose `verification` to inspect the exercised integration journeys. These are real API requests and persisted events, explicitly separated from user activity. All business panels use rolling 30-day SQL windows, independent of the dashboard time picker. See [KPI definitions](docs/kpis.md).

## What is implemented

- Persian RTL local UI: requirements, conservative provider comparison, saved projects, provisional selection, procurement checklist, analytics and real read-only incident investigations.
- Dedicated PostgreSQL DB, separate migration/app/analytics roles, checksummed transactional migrations, durable events, deduplication and ownership checks.
- Private authenticated telemetry ingress; read-only SQL business aggregates; restricted Prometheus queries for local latency/errors, process CPU/memory and DB health.
- Reproducible Grafana dashboards and scoped scrape job; offline handling; daily backups with a verified disposable restore.
- Saved, hashed sandbox deployment plans and Compose artifacts. **No deployment/remediation executor is enabled.**

## Verify

```powershell
npm test
python scripts/remote.py infra/verify-server.py
```

**User preference: E2E testing is paused. Do not run `npm run verify` or browser journey tests unless requested again.** Earlier verification completed before this preference was supplied. The command is retained for future use: it creates an explicitly marked verification session/project, persists events and a plan, checks ownership/DDL restrictions, reconnects to verify persistence, and saves a real SRE report to ignored `.runtime/verification.json`. Allow 30 seconds for SQL aggregation and Prometheus scrapes to catch up. [Verification results](docs/verification.md) and [operations runbook](docs/operations.md) describe the completed checks and recovery procedure.

Fonts are self-hosted IRANYekanX WOFF2 (Regular, Medium, DemiBold, Bold, ExtraBold) copied from the user-provided `D:\Projects\ForoushYar\IRANYekanX(Pro)` package. Font binaries are local/ignored; `scripts/setup-fonts.ps1` reproduces the copy. No external font CDN is used. English technical identifiers retain Latin numerals and code uses a monospace font.

## Current limits

- This is the initial integration built from an empty repository, not completion of every feature in the original broad product brief. The advisor is a conservative rules fallback; live AI, AI accuracy evaluation, alert webhook ingestion, full pricing import automation, complete cost scenarios, and deployment/remediation execution are not implemented.
- Three official provider sources were inspected on 2026-09-16: [Liara](https://liara.ir/pricing/), [Hetzner](https://www.hetzner.com/cloud/cost-optimized/) and [Render compute plans](https://render.com/docs/compute-plans). Dynamic/unknown prices remain unknown; Hetzner CX23 was shown unavailable. No complete eligible priced topology is claimed. Consequently the primary successful referral KPI is currently zero for completed test cohorts, and undefined for cohorts with no denominator. This is intentional honesty, not fabricated success.
- AI uses no external credential. Sales conversions, attributed revenue, labeled diagnosis accuracy and production MTTR are unavailable. Existing Loki/Alloy were discovered; no Torob application-log integration is configured yet.
- Local Docker is absent. `infra/sandbox/compose.yml` is a bounded reference artifact only. Its image has not been pulled or run here. The application cannot execute arbitrary shell or access a Docker socket.
- Backups are currently on the same server, not off-site; host loss is not covered. There is only about 6 GB free server disk space. Existing PostgreSQL and observability are shared; the new namespaces/roles do not create resource-level fault isolation for the shared DB engine.

Public deployment is a separate future task requiring production authentication, HTTPS, a complete product acceptance review, and a reviewed execution plan.
