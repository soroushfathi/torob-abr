CREATE TABLE app.sessions (
 id text PRIMARY KEY, source text NOT NULL CHECK(source IN ('user','verification')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE TABLE app.projects (
 id uuid PRIMARY KEY, owner text NOT NULL REFERENCES app.sessions(id), name text NOT NULL,
 requirements jsonb NOT NULL DEFAULT '{}', recommendation jsonb,
 selected text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES app.projects(id),
 name text NOT NULL CHECK(name IN ('intake_started','intake_completed','recommendation_succeeded','no_eligible_option','comparison_viewed','plan_selected','checklist_viewed','provider_clicked','feedback_useful','feedback_not_useful','assumptions_corrected')),
 provider text NOT NULL DEFAULT '', source text NOT NULL CHECK(source IN ('user','verification')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,name,provider)
);
CREATE INDEX events_time ON app.events(occurred_at);
CREATE TABLE app.incidents (
 id uuid PRIMARY KEY, owner text NOT NULL REFERENCES app.sessions(id), kind text NOT NULL,
 report jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.plans (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES app.projects(id),
 version integer NOT NULL, digest text NOT NULL, plan jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW app.event_counts AS
 SELECT source,name,provider,count(*)::float8 AS value FROM app.events
 WHERE occurred_at >= now()-interval '30 days' GROUP BY source,name,provider;
CREATE VIEW app.referral_cohorts AS
 SELECT p.id,s.source,p.created_at,
 min(e.occurred_at) FILTER (WHERE e.name='intake_completed') AS completed,
 min(e.occurred_at) FILTER (WHERE e.name='recommendation_succeeded') AS recommended,
 min(e.occurred_at) FILTER (WHERE e.name='plan_selected') AS selected,
 min(e.occurred_at) FILTER (WHERE e.name='provider_clicked') AS clicked
 FROM app.projects p JOIN app.sessions s ON s.id=p.owner LEFT JOIN app.events e ON e.project_id=p.id
 GROUP BY p.id,s.source;
CREATE VIEW app.funnel_kpis AS
 SELECT source,
 count(*) FILTER (WHERE completed IS NOT NULL)::float8 AS completed,
 count(*) FILTER (WHERE recommended>=completed AND recommended<=completed+interval '7 days')::float8 AS recommended,
 count(*) FILTER (WHERE recommended>=completed AND selected>=recommended AND clicked>=selected AND clicked<=completed+interval '7 days')::float8 AS successful_referrals,
 count(*) FILTER (WHERE completed<=now()-interval '7 days')::float8 AS mature_completed,
 count(*) FILTER (WHERE completed<=now()-interval '7 days' AND recommended>=completed AND selected>=recommended AND clicked>=selected AND clicked<=completed+interval '7 days')::float8 AS mature_referrals,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM recommended-created_at)) FILTER (WHERE recommended IS NOT NULL)::float8 AS median_recommendation_seconds
 FROM app.referral_cohorts WHERE completed>=now()-interval '30 days' GROUP BY source;
CREATE VIEW app.commercial_kpis AS
 SELECT e.source,e.provider,count(DISTINCT e.project_id)::float8 AS qualified_referrals
 FROM app.events e JOIN app.referral_cohorts c ON c.id=e.project_id
 WHERE e.name='provider_clicked' AND c.completed>=now()-interval '30 days'
 AND c.recommended>=c.completed AND c.selected>=c.recommended
 AND e.occurred_at>=c.selected AND e.occurred_at<=c.completed+interval '7 days'
 GROUP BY e.source,e.provider;
CREATE VIEW app.quality_kpis AS
 SELECT s.source,count(*)::float8 AS evaluated,
 count(*) FILTER (WHERE p.recommendation->>'status'='requires_verification')::float8 AS requires_verification,
 count(*) FILTER (WHERE p.recommendation->>'estimateComplete'='true')::float8 AS complete_estimates
 FROM app.projects p JOIN app.sessions s ON s.id=p.owner WHERE p.recommendation IS NOT NULL AND p.created_at>=now()-interval '30 days' GROUP BY s.source;
CREATE VIEW app.incident_kpis AS
 SELECT s.source,count(*)::float8 AS investigations,
 count(*) FILTER(WHERE report->>'status'='inconclusive')::float8 AS inconclusive,
 count(*) FILTER(WHERE report->>'sufficientEvidence'='true')::float8 AS sufficient_evidence
 FROM app.incidents i JOIN app.sessions s ON s.id=i.owner WHERE i.created_at>=now()-interval '30 days' GROUP BY s.source;
GRANT SELECT,INSERT,UPDATE ON app.projects TO torob_app;
GRANT SELECT,INSERT ON app.sessions,app.events,app.incidents,app.plans TO torob_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO torob_app;
GRANT SELECT ON app.event_counts,app.funnel_kpis,app.commercial_kpis,app.quality_kpis,app.incident_kpis TO torob_analytics;
