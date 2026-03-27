-- ============================================================
-- DROPCENTER - Schema Completo para PostgreSQL Self-Hosted
-- Baseado no schema real extraído do Supabase (2026-03-26)
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS (extraídos do Supabase)
-- ============================================================

CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial');
CREATE TYPE product_status AS ENUM ('active', 'inactive', 'draft');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'expired', 'refunded');
CREATE TYPE subscription_status AS ENUM ('active', 'overdue', 'blocked', 'cancelled');
CREATE TYPE app_role AS ENUM ('admin', 'manager', 'seller', 'operator', 'viewer');
CREATE TYPE wallet_tx_type AS ENUM ('deposit', 'debit', 'refund');
CREATE TYPE wallet_tx_status AS ENUM ('pending', 'confirmed', 'failed', 'cancelled');

-- ============================================================
-- AUTH TABLES (substituindo Supabase Auth)
-- ============================================================

CREATE TABLE auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  user_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  device_info JSONB DEFAULT '{}'
);

CREATE INDEX idx_refresh_tokens_user ON auth_refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON auth_refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  document TEXT,
  status tenant_status NOT NULL DEFAULT 'trial',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_profiles_email ON profiles(email);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Função helper has_role
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ============================================================
-- CATALOG TABLES
-- ============================================================

CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id UUID REFERENCES product_categories(id),
  ml_category_id TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category TEXT,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  weight_kg NUMERIC,
  dimensions JSONB,
  images JSONB DEFAULT '[]',
  status product_status NOT NULL DEFAULT 'draft',
  ml_category_id TEXT,
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category_id UUID REFERENCES product_categories(id),
  condition TEXT NOT NULL DEFAULT 'new',
  gtin TEXT,
  warranty_type TEXT DEFAULT 'Garantia do vendedor',
  warranty_time TEXT DEFAULT '90 dias'
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);

CREATE TABLE stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  location TEXT,
  last_sync_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

CREATE INDEX idx_stock_product ON stock(product_id);
CREATE INDEX idx_stock_tenant ON stock(tenant_id);

-- View: estoque disponível (matching real Supabase view)
CREATE OR REPLACE VIEW available_stock AS
SELECT
  s.id,
  s.product_id,
  p.tenant_id,
  p.name AS product_name,
  p.sku,
  s.quantity,
  s.reserved,
  GREATEST(s.quantity - s.reserved, 0) AS available,
  s.min_stock,
  (s.quantity - s.reserved) <= s.min_stock AS low_stock,
  s.location,
  s.updated_at
FROM stock s
JOIN products p ON p.id = s.product_id;

-- ============================================================
-- MARKETPLACE TABLES (Mercado Livre)
-- ============================================================

CREATE TABLE ml_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth_users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ml_user_id TEXT NOT NULL,
  ml_nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  store_name TEXT,
  CONSTRAINT ml_credentials_tenant_ml_user_unique UNIQUE (tenant_id, ml_user_id)
);

CREATE INDEX idx_ml_credentials_tenant ON ml_credentials(tenant_id);
CREATE INDEX idx_ml_credentials_ml_user ON ml_credentials(ml_user_id);
CREATE INDEX idx_ml_credentials_expires ON ml_credentials(expires_at);

CREATE TABLE ml_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ml_item_id TEXT,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL,
  status TEXT DEFAULT 'draft',
  category_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  ml_credential_id UUID REFERENCES ml_credentials(id)
);

CREATE INDEX idx_ml_listings_tenant ON ml_listings(tenant_id);
CREATE INDEX idx_ml_listings_product ON ml_listings(product_id);
CREATE INDEX idx_ml_listings_ml_item ON ml_listings(ml_item_id);
CREATE INDEX idx_ml_listings_status ON ml_listings(status);

-- ============================================================
-- ORDER TABLES
-- ============================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_document TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  shipping_cost NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  shipping_address JSONB,
  tracking_code TEXT,
  notes TEXT,
  ml_order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  ml_credential_id UUID REFERENCES ml_credentials(id)
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_ml_order ON orders(ml_order_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE picking_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES auth_users(id),
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_picking_tasks_order ON picking_tasks(order_id);
CREATE INDEX idx_picking_tasks_status ON picking_tasks(status);

CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carrier TEXT,
  tracking_code TEXT,
  label_url TEXT,
  status TEXT DEFAULT 'pending',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  ml_shipment_id TEXT
);

CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_ml_shipment ON shipments(ml_shipment_id);

-- ============================================================
-- FINANCIAL TABLES
-- ============================================================

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT,
  max_products INTEGER,
  max_listings INTEGER,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  max_stores INTEGER DEFAULT 1
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status subscription_status NOT NULL DEFAULT 'active',
  billing_day INTEGER NOT NULL DEFAULT 10,
  current_period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  current_period_end DATE NOT NULL DEFAULT (CURRENT_DATE + '30 days'::interval),
  blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_billing ON subscriptions(billing_day);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status payment_status NOT NULL DEFAULT 'pending',
  pix_code TEXT,
  pix_qr_url TEXT,
  payment_gateway_id TEXT,
  confirmed_by UUID REFERENCES auth_users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_subscription ON payments(subscription_id);
CREATE INDEX idx_payments_gateway ON payments(payment_gateway_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Wallet tables
CREATE TABLE wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type wallet_tx_type NOT NULL,
  amount NUMERIC NOT NULL,
  balance_after NUMERIC,
  status wallet_tx_status NOT NULL DEFAULT 'pending',
  description TEXT,
  reference_id TEXT,
  reference_type TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_wallet_balances_tenant ON wallet_balances(tenant_id);
CREATE INDEX idx_wallet_transactions_tenant ON wallet_transactions(tenant_id);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_wallet_transactions_reference ON wallet_transactions(reference_id);
CREATE INDEX idx_wallet_transactions_created ON wallet_transactions(created_at DESC);

-- ============================================================
-- SUPPORT TABLES
-- ============================================================

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth_users(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'Dúvida',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth_users(id),
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id);

-- ============================================================
-- SYSTEM TABLES
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_unread ON notifications(tenant_id, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Debitar saldo atomicamente
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
  SELECT balance INTO v_balance
  FROM wallet_balances
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO wallet_balances (tenant_id, balance)
    VALUES (p_tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;
    v_balance := 0;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_funds',
      'balance', v_balance,
      'required', p_amount
    );
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE wallet_balances
  SET balance = v_new_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id;

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

-- Creditar saldo
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
  INSERT INTO wallet_balances (tenant_id, balance)
  VALUES (p_tenant_id, p_amount)
  ON CONFLICT (tenant_id)
  DO UPDATE SET balance = wallet_balances.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;

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

-- Processar fila de pedidos pending_credit após recarga
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
  FOR v_order IN
    SELECT id, items, order_number
    FROM orders
    WHERE tenant_id = p_tenant_id AND status = 'pending_credit'
    ORDER BY created_at ASC
  LOOP
    v_cost := 0;
    SELECT COALESCE(SUM(
      (item->>'quantity')::int *
      COALESCE(p.cost_price, 0)
    ), 0) INTO v_cost
    FROM jsonb_array_elements(v_order.items::jsonb) AS item
    LEFT JOIN products p ON p.id = (item->>'product_id')::uuid;

    IF v_cost <= 0 THEN
      UPDATE orders SET status = 'approved', updated_at = now() WHERE id = v_order.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    v_result := debit_wallet(p_tenant_id, v_cost, 'Custo produto - ' || v_order.order_number, v_order.id::text, 'order');

    IF (v_result->>'success')::boolean THEN
      UPDATE orders SET status = 'approved', updated_at = now() WHERE id = v_order.id;
      v_processed := v_processed + 1;
    ELSE
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

-- Criar notificação com auto-cleanup
CREATE OR REPLACE FUNCTION create_notification(
  p_tenant_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO notifications (tenant_id, type, title, message, action_url, metadata)
  VALUES (p_tenant_id, p_type, p_title, p_message, p_action_url, p_metadata)
  RETURNING id INTO v_id;

  DELETE FROM notifications
  WHERE tenant_id = p_tenant_id
    AND id NOT IN (
      SELECT id FROM notifications
      WHERE tenant_id = p_tenant_id
      ORDER BY created_at DESC
      LIMIT 100
    );

  RETURN v_id;
END;
$$;

-- Helper: buscar config PIX do tenant
CREATE OR REPLACE FUNCTION get_pix_config()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (settings->'pix_config')::jsonb
  FROM tenants
  WHERE settings->'pix_config' IS NOT NULL
  LIMIT 1;
$$;

-- Helper: buscar endereço do armazém
CREATE OR REPLACE FUNCTION get_warehouse_address()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (settings->'warehouse_address')::jsonb
  FROM tenants
  WHERE settings->'warehouse_address' IS NOT NULL
  LIMIT 1;
$$;

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply update_updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON stock FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_ml_credentials_updated_at BEFORE UPDATE ON ml_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_ml_listings_updated_at BEFORE UPDATE ON ml_listings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGERS para SSE (LISTEN/NOTIFY)
-- ============================================================

CREATE OR REPLACE FUNCTION notify_table_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('table_changes', json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'tenant_id', COALESCE(NEW.tenant_id, OLD.tenant_id)
  )::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_notify AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_table_change();

CREATE TRIGGER notifications_notify AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_table_change();

CREATE TRIGGER ml_listings_notify AFTER INSERT OR UPDATE ON ml_listings
  FOR EACH ROW EXECUTE FUNCTION notify_table_change();

CREATE TRIGGER support_tickets_notify AFTER INSERT OR UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION notify_table_change();

CREATE TRIGGER support_messages_notify AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION notify_table_change();

CREATE TRIGGER picking_tasks_notify AFTER INSERT OR UPDATE ON picking_tasks
  FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO plans (name, slug, price, max_products, max_listings, max_stores, is_active, features)
VALUES (
  'Básico',
  'basico',
  0,
  50,
  10,
  1,
  true,
  '["Suporte por email"]'
) ON CONFLICT DO NOTHING;

-- Admin user (password: admin123 - ALTERE EM PRODUÇÃO!)
INSERT INTO auth_users (id, email, password_hash, email_verified)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin@dropcenter.com',
  '$2b$12$LJ3m4ymHFbZO5UoUJL6vVeVBKbHhJxn1Z2EEjZKQHj9xQdCnNYNLe',
  true
) ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (id, email, name)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin@dropcenter.com',
  'Administrador'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin'
) ON CONFLICT (user_id, role) DO NOTHING;
