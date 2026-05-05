-- Track ML shipping mode (me1, me2, custom, not_specified) on orders + shipments
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_mode TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shipping_mode TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_shipping_mode ON orders(shipping_mode);
