-- Add ml_status column to orders table to track original Mercado Livre order status
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ml_status TEXT;

-- Index for filtering by ML status
CREATE INDEX IF NOT EXISTS idx_orders_ml_status ON orders(ml_status);
