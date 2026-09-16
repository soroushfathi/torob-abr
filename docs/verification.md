# Observed verification — 2026-09-16

These observations were collected during setup. **E2E testing was subsequently paused at the user's request; no additional E2E or browser journey tests were run after that request.** Font changes received only file/static checks.

| Check | Observed result |
|---|---|
| Existing SSH alias | Authenticated as existing `deploy`; inspected services, resources, mounts, networks and ports. |
| Database connectivity | Local app → loopback SSH forward → `torob_cloud` succeeded. |
| Migrations | `001_core`, `002_observed_quality`, `003_catalog_timestamp_precision` applied; checksum-based repeat execution is a no-op. |
| App privileges | `CREATE TABLE app.forbidden_test` rejected with PostgreSQL `42501`. |
| Ownership | A second demo session could not select the first session's project; HTTP 404. |
| Persistence | Project and seven deduplicated events survived disconnect/reconnect with a new DB connection. |
| Actual product activity | Two verification journeys were created via real application APIs, each with intake, completion, no-confirmed-eligible result, comparison, provisional selection, checklist and provider click. Source=`verification`; no customer adoption or purchase claimed. |
| Duplicate activity | Repeated checklist/click requests produced one event each per project/provider. |
| Hard constraint | Iran-required workload could not select Hetzner; HTTP 409. Unknown prices never generated an eligible option. |
| Prometheus configuration | `promtool check config` succeeded; existing 10 rules validated. Shared config backed up and reloaded through SIGHUP. |
| Actual telemetry | `up{job="torob-cloud"}=1`, `torob_dev_online=1`, `torob_analytics_db_up=1`; real `torob_events_30d{source="verification"}` series present. |
| Existing targets | alloy, cadvisor, loki, node, prometheus, xdo-api, xdo-postgres, xdo-readiness and xdo-redis all remained up after the change. |
| Offline topology | Stopped only the local Torob app; after TTL, `torob_dev_online=0`, gateway `up=1`, analytics DB `up=1`, event aggregates remained present (two of each event). The local app was restarted afterward. |
| Real SRE investigation | Persisted database report `healthy`, with three real Prometheus evidence records: fresh online signal, local app DB=1, read-only analytics DB=1. No root-cause claim or remediation action. |
| Grafana | API accepted and returned URLs for all five dedicated dashboards. Expressions reference the existing datasource and observed real event series. Grafana rendering/login was not browser-tested. |
| Backup/recovery | Created a custom-format dump and restored to a uniquely named disposable DB. At that point projects=1, events=7, incidents=1, plans=1, migrations=1 matched exactly. Disposable DB dropped after success. Later migrations/activity were not included in that initial restore test; daily backups are enabled. |
| Network | PostgreSQL remains 127.0.0.1:5432, telemetry ingestion 127.0.0.1:19100, scrape gateway 172.22.0.1:19101, only the exact Prometheus IP allowed. |
| Unit checks | Eight domain tests passed: hard constraints, unknowns, staleness, untrusted text, missing/NaN telemetry and bounded health classification. |
| UI inspection before pause | Persian RTL home/login rendered; mobile viewport 390px had document width 375px, no horizontal overflow in that inspected screen. Other screens not visually exhaustively tested. |
| Fonts | Five WOFF2 weights copied from user-supplied IRANYekanX package, self-hosted, stylesheet and preload wired. No further E2E run. |

The Prometheus scrape initially timed out because UFW blocked container-to-host traffic. A source/interface/destination/port-specific allow rule fixed it without opening a public port. Initial no-data incident remains in the DB as an honest inconclusive observation; the later real report was healthy. The first catalog snapshot accidentally had a future UTC time; migration 003 corrects it to the actual verified retrieval date with explicit day precision.

Unavailable: live AI, complete priced eligible recommendations, sales/revenue attribution, application logs, alert ingestion, labeled diagnosis/AI evaluations, deployment/remediation execution and off-site backups. No shared service fault injection, public deployment or Git push occurred.
