-- ============================================================
-- Tabela: notifications (Sistema de Notificações In-App)
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info'
    CHECK (type IN ('low_balance', 'order_blocked', 'payment_confirmed', 'orders_released', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_unread ON notifications(tenant_id, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Vendedores veem apenas suas notificações
CREATE POLICY "Tenants can view own notifications"
  ON notifications FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Vendedores podem marcar como lidas
CREATE POLICY "Tenants can update own notifications"
  ON notifications FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Service role pode inserir (edge functions)
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================
-- Função helper: criar notificação (usada nas Edge Functions)
-- ============================================================
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

  -- Auto-cleanup: manter apenas as 100 notificações mais recentes por tenant
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
