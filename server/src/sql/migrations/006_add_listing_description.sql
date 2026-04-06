-- Add description column to ml_listings for seller-customizable descriptions
ALTER TABLE ml_listings ADD COLUMN IF NOT EXISTS description TEXT;
