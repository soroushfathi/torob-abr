CREATE VIEW app.catalog_quality AS
 WITH offers AS (
  SELECT p.id,s.source,(p.recommendation->'catalogSnapshot'->>'retrievedAt')::timestamptz AS retrieved_at,
  o AS offer FROM app.projects p JOIN app.sessions s ON s.id=p.owner,
  LATERAL jsonb_array_elements(p.recommendation->'options') o
  WHERE p.recommendation IS NOT NULL AND p.created_at>=now()-interval '30 days'
 ) SELECT source,count(*)::float8 AS offers_evaluated,
 count(*) FILTER (WHERE offer->'compute'='null'::jsonb OR offer->'ram'='null'::jsonb OR offer->'cpu'='null'::jsonb)::float8 AS missing_critical,
 max(extract(epoch FROM now()-retrieved_at))::float8 AS oldest_snapshot_age_seconds
 FROM offers GROUP BY source;
CREATE VIEW app.commercial_summary AS
 SELECT source,count(*) FILTER (WHERE compared)::float8 AS compared,
 count(*) FILTER (WHERE compared AND clicked)::float8 AS clicked
 FROM (SELECT source,project_id,bool_or(name='comparison_viewed') AS compared,bool_or(name='provider_clicked') AS clicked
 FROM app.events WHERE occurred_at>=now()-interval '30 days' GROUP BY source,project_id) p GROUP BY source;
GRANT SELECT ON app.catalog_quality,app.commercial_summary TO torob_analytics;
