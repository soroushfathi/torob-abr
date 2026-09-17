ALTER TABLE app.sessions ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'));
CREATE TABLE app.reports (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES app.projects(id),
 rules_version text NOT NULL, catalog_version text NOT NULL, snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON app.reports TO torob_app;
CREATE SCHEMA pricing AUTHORIZATION torob_owner;
CREATE TABLE pricing.sources (
 id text PRIMARY KEY, name text NOT NULL, urls jsonb NOT NULL, services jsonb NOT NULL,
 adapter text NOT NULL, parser_version text, pricing_model text NOT NULL,
 enabled boolean NOT NULL DEFAULT false, schedule text NOT NULL DEFAULT 'daily 03:15 UTC',
 next_run timestamptz, last_attempt timestamptz, last_success timestamptz,
 last_manual timestamptz, support_status text NOT NULL, extraction_config jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE pricing.runs (
 id uuid PRIMARY KEY, provider_id text NOT NULL REFERENCES pricing.sources(id),
 trigger text NOT NULL CHECK(trigger IN ('scheduled','manual')), requested_by text,
 started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','published','review','failed','unsupported','rejected')),
 stages jsonb NOT NULL DEFAULT '{}', error_code text, error_message text,
 parser_version text, extracted_count integer, changed_count integer, duration_seconds numeric,
 extraction_config jsonb, diff jsonb, review_reasons jsonb
);
CREATE UNIQUE INDEX pricing_one_active_run ON pricing.runs(provider_id) WHERE status IN ('queued','running');
CREATE INDEX pricing_runs_time ON pricing.runs(provider_id,created_at DESC);
CREATE TABLE pricing.evidence (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES pricing.runs(id), url text NOT NULL,
 retrieved_at timestamptz NOT NULL, http_status integer, sha256 text NOT NULL,
 body bytea, bytes integer NOT NULL, content_type text, expires_at timestamptz NOT NULL,
 CHECK(bytes BETWEEN 0 AND 6291456), CHECK(body IS NULL OR octet_length(body)<=6291456)
);
CREATE TABLE pricing.versions (
 id uuid PRIMARY KEY, provider_id text NOT NULL REFERENCES pricing.sources(id), run_id uuid NOT NULL UNIQUE REFERENCES pricing.runs(id),
 base_version uuid REFERENCES pricing.versions(id), parser_version text NOT NULL,
 status text NOT NULL CHECK(status IN ('candidate','published','rejected')), plans jsonb NOT NULL,
 verified_at timestamptz NOT NULL, published_at timestamptz, reviewed_by text, review_note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pricing_versions_current ON pricing.versions(provider_id,published_at DESC) WHERE status='published';
CREATE TABLE pricing.estimates (
 id uuid PRIMARY KEY, project_id uuid, report_id uuid, requested_by text NOT NULL,
 tariff_version uuid NOT NULL REFERENCES pricing.versions(id), configuration jsonb NOT NULL,
 result jsonb, evidence jsonb, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz
);
CREATE UNIQUE INDEX pricing_one_estimate_per_owner ON pricing.estimates(requested_by) WHERE status IN ('queued','running');
CREATE VIEW pricing.source_status AS
 SELECT s.*,v.id AS current_version,v.verified_at,extract(epoch FROM now()-v.verified_at)::float8 AS age_seconds,
 EXISTS(SELECT 1 FROM pricing.versions p WHERE p.provider_id=s.id AND p.status='candidate') AS needs_review
 FROM pricing.sources s LEFT JOIN LATERAL (SELECT id,verified_at FROM pricing.versions WHERE provider_id=s.id AND status='published' ORDER BY published_at DESC,id DESC LIMIT 1) v ON true;
CREATE VIEW pricing.metrics AS
 SELECT s.id AS provider,s.enabled::integer AS enabled,
 (SELECT max(finished_at) FROM pricing.runs WHERE provider_id=s.id) AS last_finished,
 (SELECT max(verified_at) FROM pricing.versions WHERE provider_id=s.id AND status='published') AS last_valid,
 (SELECT count(*)::float8 FROM pricing.runs WHERE provider_id=s.id AND status='published') AS success_total,
 (SELECT count(*)::float8 FROM pricing.runs WHERE provider_id=s.id AND status='failed') AS failure_total,
 (SELECT count(*)::float8 FROM pricing.runs WHERE provider_id=s.id AND status='review') AS suspicious_total,
 (SELECT duration_seconds::float8 FROM pricing.runs WHERE provider_id=s.id AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) AS duration_seconds,
 (SELECT extracted_count FROM pricing.runs WHERE provider_id=s.id AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) AS plan_count
 FROM pricing.sources s;
GRANT USAGE ON SCHEMA pricing TO torob_app,torob_price_worker,torob_price_admin,torob_analytics;
GRANT SELECT ON pricing.sources,pricing.source_status,pricing.versions TO torob_app;
GRANT SELECT,INSERT ON pricing.estimates TO torob_app;
GRANT SELECT ON pricing.metrics TO torob_analytics;
GRANT SELECT,INSERT,UPDATE ON pricing.sources,pricing.runs,pricing.versions,pricing.estimates TO torob_price_worker;
GRANT SELECT,INSERT,UPDATE ON pricing.evidence TO torob_price_worker;
GRANT SELECT ON pricing.source_status,pricing.sources,pricing.runs,pricing.versions,pricing.estimates TO torob_price_admin;
GRANT INSERT ON pricing.runs TO torob_price_admin;
GRANT UPDATE(enabled,next_run,last_manual) ON pricing.sources TO torob_price_admin;
GRANT UPDATE(status,reviewed_by,review_note,published_at) ON pricing.versions TO torob_price_admin;
GRANT UPDATE(status,error_message) ON pricing.runs TO torob_price_admin;
-- Evidence metadata is visible to admins; raw provider HTML is never served to browsers.
CREATE VIEW pricing.evidence_metadata AS SELECT id,run_id,url,retrieved_at,http_status,sha256,bytes,content_type,body IS NOT NULL AS retained FROM pricing.evidence;
GRANT SELECT ON pricing.evidence_metadata TO torob_price_admin;
CREATE FUNCTION pricing.finish_estimate(estimate_id uuid, owner_id text, payload jsonb, witness jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE pricing.estimates SET result=payload,evidence=witness,finished_at=now(),
 status=CASE WHEN payload->>'status' IN ('quoted_requires_verification','review') THEN 'complete' ELSE 'failed' END
 WHERE id=estimate_id AND requested_by=owner_id AND status='running';
$$;
REVOKE ALL ON FUNCTION pricing.finish_estimate(uuid,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pricing.finish_estimate(uuid,text,jsonb,jsonb) TO torob_app;
-- Preserve all existing recommendation snapshots before a user requests a new version.
INSERT INTO app.reports(id,project_id,rules_version,catalog_version,snapshot)
SELECT gen_random_uuid(),id,'legacy',coalesce(recommendation->>'catalogVersion','legacy'),recommendation
FROM app.projects WHERE recommendation IS NOT NULL;
