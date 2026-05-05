-- Add logistics_cost (admin-only field, embedded inside cost_price)
-- Used to compute real product cost: cost_price - logistics_cost
ALTER TABLE products ADD COLUMN IF NOT EXISTS logistics_cost NUMERIC DEFAULT 0;
