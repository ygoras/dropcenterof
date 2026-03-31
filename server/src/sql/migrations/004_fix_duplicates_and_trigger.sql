-- ============================================================
-- Migration 004: Fix duplicate orders + trigger + UNIQUE constraint
-- ============================================================

-- 1. Remove duplicate order (keep the first one created, delete the second)
--    Both have same ml_order_id='2000015772999300', we keep the one with smaller UUID (first alphabetically)
DELETE FROM picking_tasks WHERE order_id IN (
  SELECT id FROM orders
  WHERE ml_order_id = '2000015772999300'
  AND tenant_id = 'a4f9df71-ea94-4e26-b231-8996b0c77afc'
  ORDER BY id DESC LIMIT 1
);

DELETE FROM shipments WHERE order_id IN (
  SELECT id FROM orders
  WHERE ml_order_id = '2000015772999300'
  AND tenant_id = 'a4f9df71-ea94-4e26-b231-8996b0c77afc'
  ORDER BY id DESC LIMIT 1
);

DELETE FROM orders
WHERE id = (
  SELECT id FROM orders
  WHERE ml_order_id = '2000015772999300'
  AND tenant_id = 'a4f9df71-ea94-4e26-b231-8996b0c77afc'
  ORDER BY id DESC LIMIT 1
);

-- 2. Remove any other potential duplicates (generic cleanup)
--    For each (ml_order_id, tenant_id) pair, keep only the row with the smallest id
DELETE FROM picking_tasks WHERE order_id IN (
  SELECT o.id FROM orders o
  INNER JOIN (
    SELECT ml_order_id, tenant_id, MIN(id) AS keep_id
    FROM orders
    WHERE ml_order_id IS NOT NULL
    GROUP BY ml_order_id, tenant_id
    HAVING COUNT(*) > 1
  ) dups ON o.ml_order_id = dups.ml_order_id AND o.tenant_id = dups.tenant_id AND o.id != dups.keep_id
);

DELETE FROM shipments WHERE order_id IN (
  SELECT o.id FROM orders o
  INNER JOIN (
    SELECT ml_order_id, tenant_id, MIN(id) AS keep_id
    FROM orders
    WHERE ml_order_id IS NOT NULL
    GROUP BY ml_order_id, tenant_id
    HAVING COUNT(*) > 1
  ) dups ON o.ml_order_id = dups.ml_order_id AND o.tenant_id = dups.tenant_id AND o.id != dups.keep_id
);

DELETE FROM orders WHERE id IN (
  SELECT o.id FROM orders o
  INNER JOIN (
    SELECT ml_order_id, tenant_id, MIN(id) AS keep_id
    FROM orders
    WHERE ml_order_id IS NOT NULL
    GROUP BY ml_order_id, tenant_id
    HAVING COUNT(*) > 1
  ) dups ON o.ml_order_id = dups.ml_order_id AND o.tenant_id = dups.tenant_id AND o.id != dups.keep_id
);

-- 3. Add UNIQUE constraint to prevent future duplicates
ALTER TABLE orders ADD CONSTRAINT unique_ml_order_tenant
  UNIQUE(ml_order_id, tenant_id);

-- 4. Fix notify_table_change() to handle tables without tenant_id
CREATE OR REPLACE FUNCTION notify_table_change() RETURNS trigger AS $$
DECLARE
  t_id TEXT;
BEGIN
  -- Try to get tenant_id directly from the row
  BEGIN
    IF TG_OP = 'DELETE' THEN
      t_id := OLD.tenant_id::TEXT;
    ELSE
      t_id := NEW.tenant_id::TEXT;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    -- Table doesn't have tenant_id column, resolve via FK
    BEGIN
      IF TG_TABLE_NAME = 'picking_tasks' THEN
        IF TG_OP = 'DELETE' THEN
          SELECT o.tenant_id::TEXT INTO t_id FROM orders o WHERE o.id = OLD.order_id;
        ELSE
          SELECT o.tenant_id::TEXT INTO t_id FROM orders o WHERE o.id = NEW.order_id;
        END IF;
      ELSIF TG_TABLE_NAME = 'support_messages' THEN
        IF TG_OP = 'DELETE' THEN
          SELECT t.tenant_id::TEXT INTO t_id FROM support_tickets t WHERE t.id = OLD.ticket_id;
        ELSE
          SELECT t.tenant_id::TEXT INTO t_id FROM support_tickets t WHERE t.id = NEW.ticket_id;
        END IF;
      ELSE
        t_id := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      t_id := NULL;
    END;
  END;

  PERFORM pg_notify('table_changes', json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'tenant_id', t_id
  )::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
