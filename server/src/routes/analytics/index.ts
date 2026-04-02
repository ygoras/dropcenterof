import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryOne, queryMany } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  // Dashboard stats
  app.get('/api/analytics/dashboard', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const tenantCondition = !isAdmin && tenantId ? `WHERE tenant_id = '${tenantId}'` : '';

    const [orders, revenue, products, listings] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM orders ${tenantCondition}`),
      queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM orders ${tenantCondition} WHERE created_at >= DATE_TRUNC('month', NOW())`),
      queryOne(`SELECT COUNT(*) as total FROM products ${tenantCondition}`),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM ml_listings ${tenantCondition}`),
    ]);

    return { orders, revenue, products, listings };
  });

  // Admin overview
  app.get('/api/analytics/admin', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    const [sellers, orders, revenue, subscriptions] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total FROM tenants`),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())) as this_month FROM orders`),
      queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE created_at >= DATE_TRUNC('month', NOW())`),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM subscriptions`),
    ]);

    return { sellers, orders, revenue, subscriptions };
  });

  // ─── Analytics Filters (used by Relatórios page) ──────────────────
  app.get('/api/analytics/filters', {
    preHandler: [authMiddleware],
  }, async () => {
    const tenants = await queryMany(`SELECT id, name FROM tenants ORDER BY name`);
    const categories = await queryMany(
      `SELECT DISTINCT category_id as id, category_id as name FROM ml_listings WHERE category_id IS NOT NULL ORDER BY category_id`
    );
    return { tenants, categories };
  });

  // ─── Analytics Data (used by Relatórios page) ─────────────────────
  app.get('/api/analytics', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const qs = request.query as { dateRange?: string; tenantId?: string; categoryId?: string };

    const dateRange = qs.dateRange || '30d';
    const filterTenantId = qs.tenantId && qs.tenantId !== 'all' ? qs.tenantId : null;
    const filterCategoryId = qs.categoryId && qs.categoryId !== 'all' ? qs.categoryId : null;

    // Build parameterized conditions
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    // Date filter
    if (dateRange === '7d') conditions.push(`o.created_at >= NOW() - INTERVAL '7 days'`);
    else if (dateRange === '30d') conditions.push(`o.created_at >= NOW() - INTERVAL '30 days'`);
    else if (dateRange === '90d') conditions.push(`o.created_at >= NOW() - INTERVAL '90 days'`);

    // Tenant filter (parameterized)
    const effectiveTenantId = (!isAdmin && tenantId) ? tenantId : filterTenantId;
    if (effectiveTenantId) {
      params.push(effectiveTenantId);
      conditions.push(`o.tenant_id = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    // Sales by seller
    const salesBySeller = await queryMany(
      `SELECT o.tenant_id, t.name as tenant_name,
              COUNT(DISTINCT o.id) as order_count,
              COALESCE(SUM(o.total), 0) as total_revenue,
              0 as total_cost, 0 as total_shipping, 0 as total_fees,
              COALESCE(SUM(o.total), 0) as total_net,
              CASE WHEN COUNT(DISTINCT o.id) > 0 THEN COALESCE(SUM(o.total), 0) / COUNT(DISTINCT o.id) ELSE 0 END as avg_ticket,
              0 as items_sold
       FROM orders o
       JOIN tenants t ON t.id = o.tenant_id
       WHERE ${where}
       GROUP BY o.tenant_id, t.name
       ORDER BY total_revenue DESC`,
      params
    );

    // Daily trend
    const dailyTrend = await queryMany(
      `SELECT DATE(o.created_at) as date,
              COALESCE(SUM(o.total), 0) as revenue,
              COUNT(*) as orders,
              COALESCE(SUM(o.total), 0) as net
       FROM orders o
       WHERE ${where}
       GROUP BY DATE(o.created_at)
       ORDER BY date`,
      params
    );

    // Totals
    const totalsRow = await queryOne(
      `SELECT COALESCE(SUM(total), 0) as revenue,
              0 as cost, 0 as shipping, 0 as fees,
              COALESCE(SUM(total), 0) as net,
              COUNT(*) as orders, 0 as items_sold,
              CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total), 0) / COUNT(*) ELSE 0 END as avg_ticket
       FROM orders o
       WHERE ${where}`,
      params
    );

    // Admin sees cost_price (real cost), seller sees sell_price (their cost to admin)
    const costCol = isAdmin ? 'p.cost_price' : 'p.sell_price';

    // Sales by SKU — unnest JSONB items array
    const skuParams = [...params];
    let skuCategoryCondition = '';
    if (filterCategoryId) {
      skuParams.push(filterCategoryId);
      skuCategoryCondition = `AND COALESCE(p.category, p.ml_category_id) = $${skuParams.length}`;
    }

    const salesBySku = await queryMany(
      `SELECT
         COALESCE(item->>'sku', 'SEM-SKU') as sku,
         COALESCE(item->>'product_name', 'Produto') as product_name,
         SUM((item->>'quantity')::int) as quantity_sold,
         SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0)) as revenue,
         COALESCE(SUM((item->>'quantity')::int * COALESCE(${costCol}, 0)), 0) as cost,
         COALESCE(SUM(o.shipping_cost), 0) as shipping,
         0 as fees,
         SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0))
           - COALESCE(SUM((item->>'quantity')::int * COALESCE(${costCol}, 0)), 0) as net,
         COUNT(DISTINCT o.id) as order_count
       FROM orders o,
            jsonb_array_elements(o.items) as item
       LEFT JOIN products p ON p.id = (item->>'product_id')::uuid
       WHERE ${where} ${skuCategoryCondition}
       GROUP BY item->>'sku', item->>'product_name'
       ORDER BY revenue DESC
       LIMIT 100`,
      skuParams
    );

    // Sales by category
    const salesByCategory = await queryMany(
      `SELECT
         COALESCE(p.category, p.ml_category_id, 'Sem Categoria') as category_id,
         COALESCE(p.category, p.ml_category_id, 'Sem Categoria') as category_name,
         SUM((item->>'quantity')::int) as quantity_sold,
         SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0)) as revenue,
         COALESCE(SUM((item->>'quantity')::int * COALESCE(${costCol}, 0)), 0) as cost,
         SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0))
           - COALESCE(SUM((item->>'quantity')::int * COALESCE(${costCol}, 0)), 0) as net,
         COUNT(DISTINCT p.id) as product_count
       FROM orders o,
            jsonb_array_elements(o.items) as item
       LEFT JOIN products p ON p.id = (item->>'product_id')::uuid
       WHERE ${where}
       GROUP BY category_id, category_name
       ORDER BY revenue DESC`,
      params
    );

    return {
      salesBySeller,
      salesBySku,
      salesByCategory,
      productivity: [],
      operatorProductivity: [],
      dailyTrend,
      totals: {
        revenue: Number(totalsRow?.revenue || 0),
        cost: Number(totalsRow?.cost || 0),
        shipping: Number(totalsRow?.shipping || 0),
        fees: Number(totalsRow?.fees || 0),
        net: Number(totalsRow?.net || 0),
        orders: Number(totalsRow?.orders || 0),
        itemsSold: Number(totalsRow?.items_sold || 0),
        avgTicket: Number(totalsRow?.avg_ticket || 0),
      },
    };
  });
}
