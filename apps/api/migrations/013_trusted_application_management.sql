ALTER TABLE oauth_cloud_applications ADD COLUMN management_key_hash TEXT;
ALTER TABLE oauth_cloud_applications ADD COLUMN endpoint_origins_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE oauth_cloud_applications ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0);
ALTER TABLE oauth_cloud_application_services ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
