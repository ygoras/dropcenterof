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

    // Parameterized tenant filter — never interpolate user-derived values into SQL
    const useTenantFilter = !isAdmin && tenantId;
    const whereTenant = useTenantFilter ? `WHERE tenant_id = $1` : '';
    const andTenant = useTenantFilter ? `AND tenant_id = $1` : '';
    const tenantParam = useTenantFilter ? [tenantId] : [];

    const [orders, revenue, products, listings] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM orders ${whereTenant}`, tenantParam),
      queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE created_at >= DATE_TRUNC('month', NOW()) ${andTenant}`, tenantParam),
      queryOne(`SELECT COUNT(*) as total FROM products ${whereTenant}`, tenantParam),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM ml_listings ${whereTenant}`, tenantParam),
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
    // Only active tenants in filters; suspended/inactive hidden but not deleted
    const tenants = await queryMany(`SELECT id, name FROM tenants WHERE status = 'active' ORDER BY name`);
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

    // Sales by seller — admin perspective:
    //   total_revenue = SUM(qty × sell_price)   — admin's wholesale revenue
    //   gmv          = SUM(o.total)             — seller's GMV (informational)
    //   total_cost   = SUM(qty × cost_price)    — admin's real cost
    //   total_logistics = SUM(qty × logistics_cost) — admin's logistics
    //   total_ml_fees / total_seller_shipping = informational (seller paid these to ML/carrier)
    //   total_buyer_shipping = informational (what buyer paid)
    //   net = total_revenue − total_cost (admin's wholesale margin)
    const salesBySeller = await queryMany(
      `WITH per_order AS (
         SELECT
           o.id as oid, o.tenant_id, o.total, o.shipping_cost, o.ml_fee, o.seller_shipping_cost,
           COALESCE(SUM((item->>'quantity')::int * COALESCE(p.sell_price, 0)), 0) as wholesale_revenue,
           COALESCE(SUM((item->>'quantity')::int * COALESCE(p.cost_price, 0)), 0) as admin_cost,
           COALESCE(SUM((item->>'quantity')::int * COALESCE(p.logistics_cost, 0)), 0) as logistics_cost,
           COALESCE(SUM((item->>'quantity')::int), 0) as items_qty
         FROM orders o
         LEFT JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item ON TRUE
         LEFT JOIN products p ON p.id = (item->>'product_id')::uuid
         WHERE ${where}
         GROUP BY o.id
       )
       SELECT po.tenant_id, t.name as tenant_name,
              COUNT(DISTINCT po.oid) as order_count,
              COALESCE(SUM(po.items_qty), 0) as items_sold,
              COALESCE(SUM(po.wholesale_revenue), 0) as total_revenue,
              COALESCE(SUM(po.total), 0) as gmv,
              COALESCE(SUM(po.admin_cost), 0) as total_cost,
              COALESCE(SUM(po.logistics_cost), 0) as total_logistics,
              COALESCE(SUM(po.ml_fee), 0) as total_ml_fees,
              COALESCE(SUM(po.seller_shipping_cost), 0) as total_seller_shipping,
              COALESCE(SUM(po.shipping_cost), 0) as total_buyer_shipping,
              COALESCE(SUM(po.wholesale_revenue), 0) - COALESCE(SUM(po.admin_cost), 0) as total_net,
              CASE WHEN COUNT(DISTINCT po.oid) > 0
                   THEN COALESCE(SUM(po.total), 0) / COUNT(DISTINCT po.oid)
                   ELSE 0 END as avg_ticket
       FROM per_order po
       JOIN tenants t ON t.id = po.tenant_id
       GROUP BY po.tenant_id, t.name
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

    // Admin sees cost_price (real cost, includes logistics), seller sees sell_price (their cost to admin)
    const costCol = isAdmin ? 'p.cost_price' : 'p.sell_price';
    // For CTE-internal references (no `p.` prefix because columns are projected through the CTE)
    const costColCTE = isAdmin ? 'cost_price' : 'sell_price';

    // Totals — admin sees wholesale margin, seller sees retail margin minus ML fees and shipping
    // Use LEFT JOIN LATERAL so orders without items still count for revenue/orders
    const totalsRow = await queryOne(
      `WITH base_orders AS (
         SELECT o.id as oid, o.total, o.shipping_cost, o.ml_fee, o.seller_shipping_cost
         FROM orders o
         WHERE ${where}
       ),
       order_items AS (
         SELECT o.id as oid, item, p.cost_price, p.sell_price, p.logistics_cost
         FROM orders o
         LEFT JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item ON TRUE
         LEFT JOIN products p ON p.id = (item->>'product_id')::uuid
         WHERE ${where}
       )
       SELECT
         -- For admin: revenue is wholesale (sell_price × qty); for seller: revenue is GMV (o.total)
         ${isAdmin
           ? `(SELECT COALESCE(SUM((item->>'quantity')::int * COALESCE(sell_price, 0)), 0) FROM order_items WHERE item IS NOT NULL)`
           : `(SELECT COALESCE(SUM(total), 0) FROM base_orders)`} as revenue,
         -- GMV is always sellers' end-customer revenue (informational for admin, same as revenue for seller)
         (SELECT COALESCE(SUM(total), 0) FROM base_orders) as gmv,
         (SELECT COALESCE(SUM((item->>'quantity')::int * COALESCE(${costColCTE}, 0)), 0)
            FROM order_items WHERE item IS NOT NULL) as cost,
         (SELECT COALESCE(SUM((item->>'quantity')::int * COALESCE(logistics_cost, 0)), 0)
            FROM order_items WHERE item IS NOT NULL) as logistics_cost,
         (SELECT COALESCE(SUM(ml_fee), 0) FROM base_orders) as ml_fees,
         (SELECT COALESCE(SUM(seller_shipping_cost), 0) FROM base_orders) as seller_shipping,
         (SELECT COALESCE(SUM(shipping_cost), 0) FROM base_orders) as buyer_shipping,
         (SELECT COUNT(*) FROM base_orders) as orders,
         (SELECT COALESCE(SUM((item->>'quantity')::int), 0)
            FROM order_items WHERE item IS NOT NULL) as items_sold,
         CASE WHEN (SELECT COUNT(*) FROM base_orders) > 0
              THEN (SELECT SUM(total) FROM base_orders) / (SELECT COUNT(*) FROM base_orders)
              ELSE 0 END as avg_ticket`,
      params
    );

    const totalRevenue = Number(totalsRow?.revenue || 0);
    const totalGmv = Number(totalsRow?.gmv || 0);
    const totalCost = Number(totalsRow?.cost || 0);
    const totalLogistics = isAdmin ? Number(totalsRow?.logistics_cost || 0) : 0;
    const totalMlFees = Number(totalsRow?.ml_fees || 0);
    const totalSellerShipping = Number(totalsRow?.seller_shipping || 0);
    const totalBuyerShipping = Number(totalsRow?.buyer_shipping || 0);
    // Admin: net = revenue (wholesale) − cost (real cost); ML fees and shipping are seller's, not admin's.
    // Seller: net = revenue (GMV) − cost (sell_price they paid admin) − ML fees − their shipping costs.
    const totalNet = isAdmin
      ? totalRevenue - totalCost
      : totalRevenue - totalCost - totalMlFees - totalSellerShipping;

    // Sales by SKU — unnest JSONB items array
    const skuParams = [...params];
    let skuCategoryCondition = '';
    if (filterCategoryId) {
      skuParams.push(filterCategoryId);
      skuCategoryCondition = `AND COALESCE(p.category, p.ml_category_id) = $${skuParams.length}`;
    }

    // Admin gets logistics_cost column; seller gets 0
    const logisticsCol = isAdmin ? 'p.logistics_cost' : '0::numeric';

    // For admin: revenue per SKU/category = sell_price × qty (wholesale).
    // For seller: revenue per SKU/category = unit_price × qty (GMV).
    const skuRevenueExpr = isAdmin
      ? `SUM((item->>'quantity')::int * COALESCE(p.sell_price, 0))`
      : `SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0))`;

    const salesBySku = await queryMany(
      `SELECT
         COALESCE(item->>'sku', 'SEM-SKU') as sku,
         COALESCE(item->>'product_name', 'Produto') as product_name,
         SUM((item->>'quantity')::int) as quantity_sold,
         ${skuRevenueExpr} as revenue,
         SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0)) as gmv,
         COALESCE(SUM((item->>'quantity')::int * COALESCE(${costCol}, 0)), 0) as cost,
         COALESCE(SUM((item->>'quantity')::int * COALESCE(${logisticsCol}, 0)), 0) as logistics_cost,
         0 as shipping,
         0 as fees,
         ${skuRevenueExpr}
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

    // Sales by category — same revenue logic as SKU
    const salesByCategory = await queryMany(
      `SELECT
         COALESCE(p.category, p.ml_category_id, 'Sem Categoria') as category_id,
         COALESCE(p.category, p.ml_category_id, 'Sem Categoria') as category_name,
         SUM((item->>'quantity')::int) as quantity_sold,
         ${skuRevenueExpr} as revenue,
         SUM((item->>'quantity')::int * COALESCE((item->>'unit_price')::numeric, 0)) as gmv,
         COALESCE(SUM((item->>'quantity')::int * COALESCE(${costCol}, 0)), 0) as cost,
         COALESCE(SUM((item->>'quantity')::int * COALESCE(${logisticsCol}, 0)), 0) as logistics_cost,
         ${skuRevenueExpr}
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
        revenue: totalRevenue,           // admin: wholesale (sell_price × qty); seller: GMV (o.total)
        gmv: totalGmv,                   // sellers' GMV — informational for admin
        cost: totalCost,                 // admin: cost_price × qty; seller: sell_price × qty
        logisticsCost: totalLogistics,
        realProductCost: isAdmin ? totalCost - totalLogistics : totalCost,
        mlFees: totalMlFees,             // ML commissions paid by sellers
        sellerShipping: totalSellerShipping, // shipping borne by seller (ME2 list_cost)
        buyerShipping: totalBuyerShipping,   // shipping paid by buyer (shipments.cost)
        // Backward-compat aliases — frontend antigo continua funcionando até o redesign
        shipping: totalSellerShipping,
        fees: totalMlFees,
        net: totalNet,
        orders: Number(totalsRow?.orders || 0),
        itemsSold: Number(totalsRow?.items_sold || 0),
        avgTicket: Number(totalsRow?.avg_ticket || 0),
      },
    };
  });
}
