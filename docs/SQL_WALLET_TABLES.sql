-- ============================================================
-- MÓDULO DE CRÉDITOS / CARTEIRA DO VENDEDOR
-- Execute este script no Supabase SQL Editor (dashboard)
-- ============================================================

-- 1. Tabela de saldo da carteira (um por tenant)
CREATE TABLE IF NOT EXISTS wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- 2. Tabela de transações (histórico de depósitos e débitos)
CREATE TYPE wallet_tx_type AS ENUM ('deposit', 'debit', 'refund');
CREATE TYPE wallet_tx_status AS ENUM ('pending', 'confirmed', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type wallet_tx_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2),
  status wallet_tx_status NOT NULL DEFAULT 'pending',
  description TEXT,
  reference_id TEXT,          -- ex: order_id, asaas_payment_id
  reference_type TEXT,        -- ex: 'order', 'asaas_pix', 'manual'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX idx_wallet_balances_tenant ON wallet_balances(tenant_id);
CREATE INDEX idx_wallet_transactions_tenant ON wallet_transactions(tenant_id);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_wallet_transactions_reference ON wallet_transactions(reference_id);
CREATE INDEX idx_wallet_transactions_created ON wallet_transactions(created_at DESC);

-- 3. RLS Policies

ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- wallet_balances: admin vê tudo, seller vê só o seu
CREATE POLICY "admin_all_wallet_balances" ON wallet_balances
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "seller_own_wallet_balance" ON wallet_balances
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- wallet_transactions: admin vê tudo, seller vê só as suas
CREATE POLICY "admin_all_wallet_transactions" ON wallet_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "seller_own_wallet_transactions" ON wallet_transactions
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- 4. Função RPC para debitar saldo atomicamente (usada pelo webhook de pedidos)
CREATE OR REPLACE FUNCTION debit_wallet(
  p_tenant_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'order'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
BEGIN
  -- Lock the balance row for update
  SELECT balance INTO v_balance
  FROM wallet_balances
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  -- If no wallet exists, treat as zero balance
  IF v_balance IS NULL THEN
    INSERT INTO wallet_balances (tenant_id, balance)
    VALUES (p_tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;
    v_balance := 0;
  END IF;

  -- Check sufficient funds
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_funds',
      'balance', v_balance,
      'required', p_amount
    );
  END IF;

  -- Debit
  v_new_balance := v_balance - p_amount;

  UPDATE wallet_balances
  SET balance = v_new_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id;

  -- Record transaction
  INSERT INTO wallet_transactions (tenant_id, type, amount, balance_after, status, description, reference_id, reference_type, confirmed_at)
  VALUES (p_tenant_id, 'debit', p_amount, v_new_balance, 'confirmed', p_description, p_reference_id, p_reference_type, now())
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_new_balance,
    'transaction_id', v_tx_id
  );
END;
$$;

-- 5. Função RPC para creditar saldo (usada pelo webhook do Asaas)
CREATE OR REPLACE FUNCTION credit_wallet(
  p_tenant_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'asaas_pix'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
  v_tx_id UUID;
BEGIN
  -- Upsert balance
  INSERT INTO wallet_balances (tenant_id, balance)
  VALUES (p_tenant_id, p_amount)
  ON CONFLICT (tenant_id)
  DO UPDATE SET balance = wallet_balances.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO wallet_transactions (tenant_id, type, amount, balance_after, status, description, reference_id, reference_type, confirmed_at)
  VALUES (p_tenant_id, 'deposit', p_amount, v_new_balance, 'confirmed', p_description, p_reference_id, p_reference_type, now())
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_new_balance,
    'transaction_id', v_tx_id
  );
END;
$$;

-- 6. Função para processar fila de pedidos pending_credit após recarga
CREATE OR REPLACE FUNCTION process_pending_credit_orders(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_result JSONB;
  v_processed INT := 0;
  v_failed INT := 0;
  v_cost NUMERIC;
BEGIN
  -- Process oldest pending_credit orders first
  FOR v_order IN
    SELECT id, items, order_number
    FROM orders
    WHERE tenant_id = p_tenant_id AND status = 'pending_credit'
    ORDER BY created_at ASC
  LOOP
    -- Calculate total cost_price from order items
    v_cost := 0;
    SELECT COALESCE(SUM(
      (item->>'quantity')::int *
      COALESCE(p.cost_price, 0)
    ), 0) INTO v_cost
    FROM jsonb_array_elements(v_order.items::jsonb) AS item
    LEFT JOIN products p ON p.id = (item->>'product_id')::uuid;

    IF v_cost <= 0 THEN
      -- No cost, just approve
      UPDATE orders SET status = 'approved', updated_at = now() WHERE id = v_order.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    -- Try to debit
    v_result := debit_wallet(p_tenant_id, v_cost, 'Custo produto - ' || v_order.order_number, v_order.id::text, 'order');

    IF (v_result->>'success')::boolean THEN
      UPDATE orders SET status = 'approved', updated_at = now() WHERE id = v_order.id;
      v_processed := v_processed + 1;
    ELSE
      -- No more balance, stop processing
      v_failed := v_failed + 1;
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'remaining', v_failed
  );
END;
$$;

-- 7. Grants para service_role (usado pelas Edge Functions)
GRANT EXECUTE ON FUNCTION debit_wallet TO service_role;
GRANT EXECUTE ON FUNCTION credit_wallet TO service_role;
GRANT EXECUTE ON FUNCTION process_pending_credit_orders TO service_role;
