# KPI dictionary v1

Business source of truth: `app.events` and SQL views in PostgreSQL. The process counters only describe technical runtime observations. No personal/project/session IDs are exported as Prometheus labels. Bounded labels: event, provider (`liara`, `hetzner`, `render`), source (`user`, `verification`), job/service/environment, histogram bucket.

| Measure | Definition / units / limits |
|---|---|
| Intake started/completed | Distinct project/event rows in rolling 30 days. One project is one journey; completion is recorded only after successful validation and recommendation persistence. |
| Successful recommendation | At least one confirmed eligible evidence-backed option, not just a generated explanation. Unknown critical requirements prevent success. |
| No eligible option | Completed intake with no confirmed eligible option; includes provisional/verification-required catalogs. |
| Comparison / selection / checklist / click | Durable server-validated event. Deduplication key `(project_id,name,provider)`. Selection can be provisional and is labeled accordingly. Click is not a sale. |
| Feedback | Explicit useful/not-useful event endpoint; UI feedback controls not yet present. No fabricated feedback. |
| Recommendation time | Median seconds from project creation to first eligible recommendation. No valid recommendation means no observation. |
| Primary referral journey | Completion cohort in last 30 days; eligible recommendation, selection then click, in that order, within 7 days of completion. Mature denominator excludes the most recent 7 days. Provisional ratio shown separately. Undefined denominator = no data. |
| Provider CTR | Unique compared projects that clicked at least one provider / unique compared projects; events in rolling 30 days. Bounded 0–1. |
| Qualified referral by provider | Distinct clicked project/provider with eligible recommendation and ordered selection within 7-day attribution window. |
| Conversion / revenue | Not connected. No real attribution/transaction feed; no numeric sales claims. |
| Catalog freshness | Maximum age in seconds of catalog snapshots persisted with evaluated recommendations in last 30 days; stale threshold 7 days. |
| Missing critical spec / price | Evaluated options missing compute price, CPU or RAM / evaluated options, from persisted snapshots. This is a bounded subset of full completeness. |
| Estimate completeness | Complete topology estimates / evaluated recommendations. No unknown charge is silently zeroed. |
| Hard-constraint violation | Independent production/evaluation rate not yet measured; API constraint-blocking tests do not constitute a measured rate. |
| Corrected-assumption changes | Not instrumented yet; no percentage asserted. |
| AI accuracy | No labeled live-model evaluation performed. Unavailable. |
| Investigations with evidence | Fresh online signal plus all required bounded evidence values; not a claim of confirmed root cause. |
| Inconclusive investigations | Missing/NaN evidence or offline machine / all investigations, rolling 30 days. Integration unavailable is a separate status. |
| Deployment success/rollback/readiness | No executed runs; unavailable. Only plans/artifacts exist. |
| Diagnosis, remediation acceptance, recovery, alert latency | No labeled fault exercise, approved remediation, recovery observation or alert integration; explicitly unavailable. |
| HTTP volume/error/latency | Requests, HTTP 5xx, histogram p95 over 5m rates. Technical counters reset when local process restarts; Prometheus rate handles resets. Includes health checks. |
| CPU/RSS | Local Torob process only; CPU seconds per wall second relative to one core, RSS bytes. No shared-host capacity claim. |
| Database health | Independent local application connection and server read-only analytics connection; values 1/0. |
| AI fallback | Rules fallback attempts / requirement analysis attempts; live model latency, failures, tokens and configured-cost estimates unavailable until a live model exists. |

Exporter polls read-only SQL every 15 seconds; Prometheus scrapes every 15 seconds. Business aggregates are gauges, never cumulative process counters. Query failures remove cached aggregates and report `torob_analytics_db_up=0`; dashboards must not disguise this as zero activity. Technical samples expire after 90 seconds; `torob_dev_online=0` means disconnected/closed/asleep, not an application incident in production.

No mature cohorts at initial setup means the primary mature KPI is **no data**. The catalog currently produces only provisional candidates, so no eligible successful referral is recorded. Verification traffic is real persisted test activity, separately labeled. The UI session uses source `user` and includes the agent's visible manual UI acceptance activity; it is not evidence of external customer adoption.
