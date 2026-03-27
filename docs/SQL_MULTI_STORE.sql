-- =============================================
-- MULTI-STORE: Suporte a múltiplas lojas ML por vendedor
-- Execute este script no Supabase SQL Editor
-- =============================================

-- 1. Adicionar max_stores ao plano
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_stores integer DEFAULT 1;

-- 2. Adicionar store_name (apelido personalizado) às credenciais ML
ALTER TABLE ml_credentials ADD COLUMN IF NOT EXISTS store_name text;

-- 3. Remover constraint unique antiga (tenant_id) e criar nova (tenant_id + ml_user_id)
-- Primeiro, verificar e dropar a constraint existente
DO $$
BEGIN
  -- Drop unique constraint on tenant_id if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ml_credentials_tenant_id_key' 
    AND conrelid = 'ml_credentials'::regclass
  ) THEN
    ALTER TABLE ml_credentials DROP CONSTRAINT ml_credentials_tenant_id_key;
  END IF;
  
  -- Also check for index-based unique constraint
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'ml_credentials_tenant_id_key' 
    AND tablename = 'ml_credentials'
  ) THEN
    DROP INDEX ml_credentials_tenant_id_key;
  END IF;
END $$;

-- Criar nova constraint composta
ALTER TABLE ml_credentials 
  ADD CONSTRAINT ml_credentials_tenant_ml_user_unique 
  UNIQUE (tenant_id, ml_user_id);

-- 4. Adicionar ml_credential_id às tabelas de anúncios e pedidos
ALTER TABLE ml_listings ADD COLUMN IF NOT EXISTS ml_credential_id uuid REFERENCES ml_credentials(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ml_credential_id uuid REFERENCES ml_credentials(id);

-- 5. Backfill: associar registros existentes à credencial correta
UPDATE ml_listings l
SET ml_credential_id = c.id
FROM ml_credentials c
WHERE l.tenant_id = c.tenant_id
  AND l.ml_credential_id IS NULL;

UPDATE orders o
SET ml_credential_id = c.id
FROM ml_credentials c
WHERE o.tenant_id = c.tenant_id
  AND o.ml_credential_id IS NULL
  AND o.ml_order_id IS NOT NULL;
