-- Store ML logistic_type to identify Correios vs FLEX vs Full vs Self-service
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS logistic_type TEXT;
