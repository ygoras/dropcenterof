-- ============================================================
-- Row Level Security (RLS) Policies for Multi-Tenant Isolation
-- This is the LAST LINE OF DEFENSE — app layer is the first.
-- ============================================================

-- Helper: get current tenant from session variable
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: check if current session is admin (bypass RLS)
CREATE OR REPLACE FUNCTION is_admin_session() RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(current_setting('app.is_admin', true), 'false') = 'true';
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Enable RLS on all tenant-scoped tables
-- ============================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policies: Admin bypass + tenant isolation
-- ============================================================

-- Template policy for each table:
-- Admins can access all rows, tenants can only access their own

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products', 'orders', 'wallet_transactions', 'wallet_balances',
      'notifications', 'subscriptions', 'payments', 'ml_credentials',
      'ml_listings', 'shipments', 'picking_tasks', 'support_tickets',
      'support_messages', 'stock'
    ])
  LOOP
    -- Drop existing policies if any
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS admin_bypass ON %I', tbl);

    -- Admin bypass policy
    EXECUTE format(
      'CREATE POLICY admin_bypass ON %I FOR ALL USING (is_admin_session())',
      tbl
    );

    -- Tenant isolation policy
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = current_tenant_id())',
      tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Force RLS even for table owners (critical for security)
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products', 'orders', 'wallet_transactions', 'wallet_balances',
      'notifications', 'subscriptions', 'payments', 'ml_credentials',
      'ml_listings', 'shipments', 'picking_tasks', 'support_tickets',
      'support_messages', 'stock'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;
