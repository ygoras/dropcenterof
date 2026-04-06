-- Store ML thumbnail URL directly on listing for display without product JOIN
ALTER TABLE ml_listings ADD COLUMN IF NOT EXISTS ml_thumbnail TEXT;
