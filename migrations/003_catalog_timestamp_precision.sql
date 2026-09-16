-- Correct the initial verification snapshot's accidentally future UTC time.
-- Source retrieval was verified on this date; time-of-day precision was not retained.
UPDATE app.projects
SET recommendation=jsonb_set(
 jsonb_set(recommendation,'{catalogSnapshot,retrievedAt}','"2026-09-16"'::jsonb),
 '{catalogSnapshot,retrievalPrecision}','"day"'::jsonb)
WHERE recommendation->>'catalogVersion'='2026-09-16.1'
AND recommendation->'catalogSnapshot'->>'retrievedAt'='2026-09-16T11:45:00Z';
