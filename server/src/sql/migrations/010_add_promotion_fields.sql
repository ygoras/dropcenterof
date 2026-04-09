-- Track ML promotions on listings
ALTER TABLE ml_listings ADD COLUMN IF NOT EXISTS original_price NUMERIC;
ALTER TABLE ml_listings ADD COLUMN IF NOT EXISTS has_promotion BOOLEAN DEFAULT false;
