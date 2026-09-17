# Private infrastructure runbook

Current pricing support service, limited roles, daily schedule, evidence policy and scoped installation are documented in [pricing-packages.md](pricing-packages.md). All product tests, including historical verification commands below, are paused by the user. Do not execute them without explicit reauthorization.

## Boundary and discovered server

All remote work uses the existing `ssh xdo-new` alias. The app stays on the Windows development machine. Server login is `deploy` with available non-interactive sudo; no host/user/key was invented. Do not expose this prototype publicly.

On 2026-09-16 the Ubuntu server had about 5.8 GiB RAM (3.1 GiB available), 975 MiB swap and a 34 GiB root disk with about 6 GiB free (82% used). Existing Compose projects include `xdo-backend`, `xdo-observability`, `xdo-web-app`, `xdo-website`, `hakim-office`, `mailu` and `deploy` (LBIA). Those applications, volumes and container lifecycles were preserved.

Reused services:

| Service | Existing resource | Boundary |
|---|---|---|
| PostgreSQL | `xdo-backend-postgres-1`, PostgreSQL 16 / PostGIS 3.4 | host `127.0.0.1:5432`; persistent volume `xdo-backend_postgres_data` |
| Prometheus | `xdo-observability-prometheus-1`, v3.5.5 | host `127.0.0.1:9090`; persistent `xdo-observability_prometheus_data` |
| Grafana | `xdo-observability-grafana-1`, v13.1.3 | existing host port 3300; persistent `xdo-observability_grafana_data` |
| Logs | existing Loki 3.7.0 + Alloy 1.18.0 | Docker observability network; no Torob log ingestion configured |

Existing network `xdo-observability_observability`: `172.22.0.0/16`, bridge gateway `172.22.0.1`, current Prometheus container `172.22.0.7`. PostgreSQL is on `xdo-backend_default`. Existing exporters: node, cAdvisor, postgres, redis and blackbox. Existing logs use Docker json-file, journald, Loki/Alloy. No unrelated logs were ingested into the local assistant.

Pre-existing host listeners included SSH 22, HTTP(S) 80/443, DNS 53, mail 25/465/587/993, application/admin ports 3000/3002/3300/3303/8000/8082/8443/9000, and loopback ports 3001/5380/6379/9001/8081/9090/5432. These were inventoried and preserved. Grafana's existing host binding is `0.0.0.0:3300`; this task did not create it or change shared ingress policy. **Use the SSH URL and existing authenticated admin account.** The Torob folder is admin-only. Public exposure of the existing shared stack requires a separate coordinated review; UFW alone does not establish whether Docker-published ports are externally accessible.

## Secure local topology

```text
Local app 127.0.0.1:3100
  DB       → local 127.0.0.1:15432 → SSH xdo-new → server 127.0.0.1:5432
  Telemetry→ local 127.0.0.1:19100 → SSH xdo-new → server 127.0.0.1:19100
  SRE      → same telemetry tunnel → fixed read-only Prometheus queries
Browser    → local 127.0.0.1:13300 → SSH xdo-new → existing Grafana :3300

Prometheus 172.22.0.7 → gateway 172.22.0.1:19101/metrics
Gateway    → read-only torob_analytics → torob_cloud aggregate views
```

SSHD currently has `AllowTcpForwarding local`, `GatewayPorts no`. No reverse tunnel or SSHD changes are used. Local app sends authenticated, size-limited, allowlisted numeric samples every 15 seconds. The gateway is a dedicated unprivileged systemd service, not a remotely deployed application. It accepts POST only on loopback, keeps the latest technical snapshot on disk, and allows scrape GET only from the existing Prometheus IP. Its read-only evidence endpoint accepts only three fixed incident kinds, not URLs or arbitrary PromQL. Responses, query timeouts and payload sizes are bounded.

Business aggregates are queried server-side using `torob_analytics`, independent of the development machine. After 90 seconds without local telemetry, technical measurements are omitted and `torob_dev_online=0`. Prometheus scrape availability is a separate signal. Old CPU/memory data is never kept as a fresh health measurement. If the gateway or analytics DB is unavailable, panels show no data/integration failure.

## Server changes made

- `/opt/torob-cloud/`: support scripts, isolated Python venv with `psycopg[binary] 3.2.10`, five dashboard JSON files, gateway config, state, backups and root-only secrets. The local application source was **not** uploaded.
- System user `torob-cloud` (nologin), service `torob-cloud-telemetry.service` with filesystem hardening, no capabilities, no Docker access, 160 MiB memory and 15% CPU quota.
- `torob-cloud-backup.service` and daily `torob-cloud-backup.timer` at 02:30 UTC plus randomized delay; seven most recent dump copies.
- Installed four small supporting Ubuntu packages because venv was missing: `python3-venv`, `python3.12-venv`, `python3-pip-whl`, `python3-setuptools-whl`. No existing package was upgraded.
- DB `torob_cloud`; roles `torob_owner`, `torob_app`, `torob_analytics`, each with a separate generated credential, connection limit 8 and bounded statement/idle transaction timeouts. App has only required DML/sequence privileges; analytics can only select aggregate views and defaults to read-only transactions. Neither has schema creation privileges.
- Prepended HBA rules allowing these three roles to connect only to `torob_cloud` with SCRAM and rejecting their access to every other DB. Original HBA was backed up and parsed before reload. Existing rules remain underneath unchanged. No shared PostgreSQL restart.
- Appended one `torob-cloud` scrape job to `/opt/xdo/monitoring/target/prometheus.yml`; bounded scrape timeout, body, label and sample limits. `promtool` validates a candidate before applying; SIGHUP reload, no restart. On validation/load failure the script restores the original.
- One UFW input rule restricted to bridge `br-9f40e34903ca`, source `172.22.0.7`, destination `172.22.0.1`, TCP 19101. No rule for public interfaces. UFW files backed up; dry-run validated before adding.
- Grafana folder UID `torob-cloud`, five dashboard UIDs prefixed `torob-`, admin-only folder permissions. Existing datasource `foroushyar-prometheus` reused; no datasource credential changes. Online SQLite backup of Grafana and previous Torob dashboard versions made before updates.

Root-only credentials: `/opt/torob-cloud/secrets/credentials.json`. Gateway has only its analytics password and ingest token in a file readable by its dedicated service user. Shared Grafana admin credentials were used in memory from the existing container configuration, not copied to this project. DB passwords never appear in command-line arguments or logs.

## Repeatable provisioning and configuration

Review the concrete plan before executing these mutation scripts. They are for this inspected existing server topology, not an arbitrary new server:

```powershell
python scripts/remote.py infra/bootstrap.py
python scripts/configure-local.py  # only if .env does not already exist
# Start scripts/tunnel.ps1, then:
npm run migrate
python scripts/generate-dashboards.py
python scripts/upload-infra.py
python scripts/remote.py infra/install-monitoring.py
python scripts/remote.py infra/allow-scrape.py
ssh xdo-new 'sudo systemctl restart torob-cloud-telemetry.service'
```

Only restart the Torob gateway after changing its Python/config files. Never restart unrelated services for this task. The install script backs up shared config and validates syntax; it refuses to overwrite a dashboard UID owned by another folder. Dashboard JSON comes from the repo and is applied via the existing Grafana API, without changing the shared Compose/provisioning mounts. Existing Torob dashboard versions are backed up before overwrite.

Container IP changes are a documented dependency: after the shared observability stack is recreated, inspect the bridge and Prometheus IP; update the Torob gateway config and narrow UFW rule accordingly. Fail closed, do not allow an entire public subnet. The scrape gateway address normally survives a container recreation but not recreation of its Docker network with different addressing.

## Backup and recovery

`/opt/torob-cloud/backups/torob_cloud-*.dump` are custom-format `pg_dump --no-owner --no-acl` backups of **only** `torob_cloud`, retained as the most recent seven copies. Timer is persistent across reboot. Backup process is root-only and reads existing admin identity without printing its environment; files use umask 077. Shared configuration snapshots are also here in dated subdirectories. Monitor growth because only ~6 GB is free; no cleanup of unrelated data is authorized.

Run a fresh backup:

```powershell
ssh xdo-new 'sudo systemctl start torob-cloud-backup.service'
ssh xdo-new 'sudo systemctl status torob-cloud-backup.timer --no-pager'
```

The completed recovery test is repeatable:

```powershell
python scripts/remote.py infra/restore-check.py
```

It creates a uniquely named `torob_cloud_restorecheck_<timestamp>` DB, restores the newest dump, verifies counts in projects/events/incidents/plans/migrations, then drops **only that disposable DB**. It never overwrites the live Torob DB. For a production recovery, first restore to a new dedicated DB, verify the data and app, then review a separate cutover plan. Because dumps omit ownership/ACLs, restore as `torob_owner` (via an administrative connection with `SET ROLE`/`pg_restore --role`) and reapply explicit app/analytics grants from the migration files. Recreate roles and the dedicated HBA allow rule if changing the database name. Do not rerun table-creating migrations over restored tables; preserve and verify `app.migrations` checksums.

Recovery target: up to 24 hours of data loss with the daily schedule; no guaranteed RTO has been established. The observed small-database restore took seconds, not a production RTO measurement. **No off-site backup, PITR or host-loss recovery is configured.** Store an encrypted copy off-server before treating this as production. Keep role credentials separate and protected.

## Read-only SRE and sandbox boundary

`/api/incidents` accepts only `database`, `latency`, `resources`, requires a local session, and stores its evidence/report. The gateway executes fixed PromQL constrained to `job="torob-cloud"`, with a 3-second Prometheus query timeout and bounded response. No arbitrary host, URL, log query, SSH command, Docker socket or model-generated shell is exposed.

An observed healthy DB report contains `online`, `local_database_up`, and `analytics_database_up`; missing evidence remains inconclusive. A few idle samples cannot justify downsizing or forecast savings. Loki/Alloy are known to exist but are not queried by the app. The sandbox artifact is local, loopback port 3180, dedicated Compose name, stateless storage and resource limits. No Docker runtime exists locally, so plans can be displayed and persisted but cannot run. Any future executor must bind an explicit user click to the saved digest/version and allow only this sandbox's fixed actions. Remote remediation and fault injection into shared services are prohibited.

## Roll back this integration without touching unrelated resources

Stop/disable only `torob-cloud-telemetry.service` and `torob-cloud-backup.timer` if retiring the integration. Remove only the marked Torob scrape job after validating a candidate config and reload Prometheus; remove only its matching UFW rule. Remove only the five `torob-` dashboards/folder if approved. Preserve the DB and backups by default. Do not restore an old full shared Grafana database or Prometheus configuration over newer unrelated changes; compare and restore just the affected entries. Dropping DB/roles is a separate destructive action, not part of routine rollback.

References: [Prometheus scrape configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/), [Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/), [PostgreSQL backup](https://www.postgresql.org/docs/16/backup-dump.html).
