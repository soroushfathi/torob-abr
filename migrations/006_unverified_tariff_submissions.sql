-- User-reported tariffs are kept separate from published provider versions.
-- An admin review of pricing.versions cannot publish these submissions.
CREATE TABLE pricing.unverified_tariff_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_key text NOT NULL UNIQUE,
 provider_id text NOT NULL REFERENCES pricing.sources(id),
 service text NOT NULL,
 source_url text NOT NULL,
 reported_by text NOT NULL CHECK (reported_by = 'user'),
 source_access_status text NOT NULL,
 verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status = 'unverified'),
 received_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 data jsonb NOT NULL,
 CHECK (verified_at IS NULL),
 CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX unverified_tariff_submissions_provider_time
 ON pricing.unverified_tariff_submissions(provider_id,received_at DESC);
GRANT SELECT ON pricing.unverified_tariff_submissions TO torob_price_admin;
