-- Add source column to ml_listings to distinguish internal vs imported listings
ALTER TABLE ml_listings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';

-- Set existing listings as internal
UPDATE ml_listings SET source = 'internal' WHERE source IS NULL;
