-- Expose only explicitly public, unverified plan claims to the local app.
-- No submitted rate is promoted to pricing.versions or used as a verified quote.
CREATE VIEW pricing.public_unverified_tariffs AS
 SELECT id,provider_id,service,source_url,received_at,data->'plans' AS plans
 FROM pricing.unverified_tariff_submissions
 WHERE provider_id='arvan' AND service='object_storage' AND verification_status='unverified';
GRANT SELECT ON pricing.public_unverified_tariffs TO torob_app;
