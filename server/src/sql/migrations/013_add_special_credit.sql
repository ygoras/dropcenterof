-- Add special_credit column to wallet_balances
ALTER TABLE wallet_balances ADD COLUMN IF NOT EXISTS special_credit NUMERIC NOT NULL DEFAULT 0;

-- Update debit_wallet to consume regular balance first, then special_credit as fallback
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
  v_special NUMERIC;
  v_new_balance NUMERIC;
  v_new_special NUMERIC;
  v_from_balance NUMERIC := 0;
  v_from_special NUMERIC := 0;
  v_tx_id UUID;
BEGIN
  SELECT balance, special_credit INTO v_balance, v_special
  FROM wallet_balances
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO wallet_balances (tenant_id, balance, special_credit)
    VALUES (p_tenant_id, 0, 0)
    ON CONFLICT (tenant_id) DO NOTHING;
    v_balance := 0;
    v_special := 0;
  END IF;

  -- Insufficient if regular + special < amount
  IF v_balance + COALESCE(v_special, 0) < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_funds',
      'balance', v_balance,
      'special_credit', COALESCE(v_special, 0),
      'required', p_amount
    );
  END IF;

  -- Debit regular balance first
  IF v_balance >= p_amount THEN
    v_from_balance := p_amount;
    v_new_balance := v_balance - p_amount;
    v_new_special := COALESCE(v_special, 0);
  ELSE
    -- Use all regular balance, fallback to special_credit
    v_from_balance := v_balance;
    v_from_special := p_amount - v_balance;
    v_new_balance := 0;
    v_new_special := COALESCE(v_special, 0) - v_from_special;
  END IF;

  UPDATE wallet_balances
  SET balance = v_new_balance,
      special_credit = v_new_special,
      updated_at = now()
  WHERE tenant_id = p_tenant_id;

  INSERT INTO wallet_transactions (
    tenant_id, type, amount, balance_after, status, description,
    reference_id, reference_type, confirmed_at, metadata
  )
  VALUES (
    p_tenant_id, 'debit', p_amount, v_new_balance, 'confirmed', p_description,
    p_reference_id, p_reference_type, now(),
    jsonb_build_object(
      'from_balance', v_from_balance,
      'from_special_credit', v_from_special,
      'new_special_credit', v_new_special
    )
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_new_balance,
    'special_credit', v_new_special,
    'from_balance', v_from_balance,
    'from_special_credit', v_from_special,
    'transaction_id', v_tx_id
  );
END;
$$;
