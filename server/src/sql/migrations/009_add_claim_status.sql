-- Track ML claims/disputes on orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_status TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_claim_status ON orders(claim_status);
