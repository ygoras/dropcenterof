-- 015_orders_ml_fee_seller_shipping.sql
-- Adiciona colunas para taxa ML cobrada do vendedor e frete pago pelo vendedor.
-- NULL = pedido antigo (não calculado); analytics trata como 0 nos SUMs.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ml_fee numeric(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seller_shipping_cost numeric(12,2) DEFAULT NULL;

COMMENT ON COLUMN orders.ml_fee IS 'Soma das comissoes ML cobradas do vendedor neste pedido (sale_fee x qty por item). NULL = pedido antigo, nao calculado';
COMMENT ON COLUMN orders.seller_shipping_cost IS 'Frete sob responsabilidade do vendedor (shipping_option.list_cost do ME2). NULL = pedido antigo ou frete nao rastreado';
