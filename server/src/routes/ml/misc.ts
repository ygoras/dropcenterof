import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { query, queryOne, queryMany } from '../../lib/db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { logger } from '../../lib/logger.js';

const ML_API = 'https://api.mercadolibre.com';

export async function registerMlMiscRoutes(app: FastifyInstance) {
  // ─── Disconnect ML account ─────────────────────────────────────────
  app.post('/api/ml/disconnect', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = request.body as { tenant_id?: string } | null;
    const tenantId = body?.tenant_id || request.user.tenantId;

    if (!tenantId) {
      return reply.status(400).send({ error: 'tenant_id é obrigatório' });
    }

    // Verify user belongs to this tenant (unless admin)
    const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');
    if (!isAdmin && request.user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    try {
      // 1. Fetch credentials for revocation
      const fullCred = await queryOne<{
        access_token: string | null; refresh_token: string | null; ml_user_id: string | null;
      }>(
        `SELECT access_token, refresh_token, ml_user_id FROM ml_credentials WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );

      if (fullCred && env.ML_APP_ID) {
        // 2. Revoke application permissions via ML API
        if (fullCred.access_token && fullCred.ml_user_id) {
          try {
            const revokeRes = await fetch(
              `${ML_API}/users/${fullCred.ml_user_id}/applications/${env.ML_APP_ID}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${fullCred.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            logger.info({ tenantId, status: revokeRes.status }, 'ML app permission revoke');
          } catch (revokeErr) {
            logger.warn({ err: revokeErr, tenantId }, 'Failed to revoke ML app permissions (non-blocking)');
          }
        }

        // 3. Revoke tokens
        if (env.ML_CLIENT_SECRET) {
          const tokensToRevoke = [fullCred.access_token, fullCred.refresh_token].filter(Boolean) as string[];
          for (const token of tokensToRevoke) {
            try {
              await fetch(`${ML_API}/oauth/token/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  client_id: env.ML_APP_ID,
                  client_secret: env.ML_CLIENT_SECRET,
                  token,
                }),
              });
            } catch (revokeErr) {
              logger.warn({ err: revokeErr }, 'Failed to revoke ML token (non-blocking)');
            }
          }
          logger.info({ tenantId }, 'ML tokens revoked');
        }
      }

      // 4. Delete credentials from database
      await query(`DELETE FROM ml_credentials WHERE tenant_id = $1`, [tenantId]);

      return reply.send({ success: true });
    } catch (err) {
      logger.error({ err, tenantId }, 'Disconnect error');
      return reply.status(500).send({ error: 'Erro ao desconectar Mercado Livre' });
    }
  });

  // ─── Price Update ──────────────────────────────────────────────────
  app.post('/api/ml/price-update', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = request.body as {
      product_id?: string; old_cost_price?: number; new_cost_price?: number;
    } | null;

    if (!body?.product_id || !body?.old_cost_price || !body?.new_cost_price) {
      return reply.status(400).send({ error: 'product_id, old_cost_price e new_cost_price são obrigatórios' });
    }

    const { product_id, old_cost_price, new_cost_price } = body;

    if (old_cost_price === new_cost_price) {
      return reply.send({ success: true, message: 'Custo não alterado', updated: 0 });
    }

    try {
      // Find all published listings for this product
      const listings = await queryMany<{
        id: string; ml_item_id: string | null; price: number;
        category_id: string; tenant_id: string; attributes: Record<string, unknown> | null;
      }>(
        `SELECT id, ml_item_id, price, category_id, tenant_id, attributes
         FROM ml_listings
         WHERE product_id = $1 AND ml_item_id IS NOT NULL`,
        [product_id]
      );

      if (!listings || listings.length === 0) {
        return reply.send({ success: true, message: 'Nenhum anúncio publicado encontrado', updated: 0 });
      }

      const ratio = new_cost_price / old_cost_price;
      const results: Array<{ listing_id: string; old_price: number; new_price: number; success: boolean; error?: string }> = [];

      for (const listing of listings) {
        const newPrice = Math.round(listing.price * ratio * 100) / 100;

        // Get tenant credentials
        const cred = await queryOne<{
          access_token: string; expires_at: string;
        }>(
          `SELECT access_token, expires_at FROM ml_credentials WHERE tenant_id = $1 LIMIT 1`,
          [listing.tenant_id]
        );

        if (!cred || new Date(cred.expires_at) < new Date()) {
          // Update locally even without ML sync
          await query(
            `UPDATE ml_listings SET price = $1, updated_at = NOW() WHERE id = $2`,
            [newPrice, listing.id]
          );
          results.push({
            listing_id: listing.id,
            old_price: listing.price,
            new_price: newPrice,
            success: false,
            error: 'Sem credenciais ML válidas - atualizado apenas localmente',
          });
          continue;
        }

        // Update price on ML
        try {
          const mlRes = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${cred.access_token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ price: newPrice }),
          });

          const mlData: any = await mlRes.json();

          if (!mlRes.ok) {
            await query(
              `UPDATE ml_listings SET price = $1, sync_status = 'error', updated_at = NOW() WHERE id = $2`,
              [newPrice, listing.id]
            );
            results.push({
              listing_id: listing.id,
              old_price: listing.price,
              new_price: newPrice,
              success: false,
              error: mlData.message || 'Erro ML',
            });
            continue;
          }

          // Fetch updated fees
          const listingTypeId = (listing.attributes as any)?._listing_type_id || 'gold_pro';
          let saleFeeAmount = 0;
          let netAmount = newPrice;
          try {
            const categoryId = listing.category_id || 'MLB1000';
            const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${newPrice}&category_id=${categoryId}&listing_type_id=${listingTypeId}&logistic_type=cross_docking&shipping_mode=me2`;
            const feesRes = await fetch(feesUrl, {
              headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
            });
            if (feesRes.ok) {
              const feesData: any = await feesRes.json();
              const feeEntry = Array.isArray(feesData)
                ? feesData.find((f: any) => f.listing_type_id === listingTypeId)
                : feesData;
              if (feeEntry) {
                saleFeeAmount = feeEntry.sale_fee_amount || 0;
                netAmount = newPrice - saleFeeAmount;
              }
            }
          } catch (feeErr) {
            logger.warn({ err: feeErr }, 'Could not fetch fees during price update');
          }

          const updatedAttrs = {
            ...(listing.attributes || {}),
            _ml_sale_fee: saleFeeAmount,
            _ml_net_amount: netAmount,
          };

          await query(
            `UPDATE ml_listings
             SET price = $1, sync_status = 'synced', last_sync_at = NOW(), updated_at = NOW(), attributes = $2
             WHERE id = $3`,
            [newPrice, JSON.stringify(updatedAttrs), listing.id]
          );

          results.push({
            listing_id: listing.id,
            old_price: listing.price,
            new_price: newPrice,
            success: true,
          });
        } catch (err: any) {
          results.push({
            listing_id: listing.id,
            old_price: listing.price,
            new_price: newPrice,
            success: false,
            error: String(err),
          });
        }
      }

      return reply.send({
        success: true,
        ratio,
        updated: results.filter((r) => r.success).length,
        total: results.length,
        results,
      });
    } catch (err) {
      logger.error({ err }, 'ml-price-update error');
      return reply.status(500).send({ error: 'Erro interno ao atualizar preços' });
    }
  });

  // ─── Shipping Cost ─────────────────────────────────────────────────
  app.post('/api/ml/shipping-cost', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.status(400).send({ error: 'Perfil sem tenant' });
    }

    // Get ML credentials
    const cred = await queryOne<{
      access_token: string; expires_at: string; ml_user_id: string;
    }>(
      `SELECT access_token, expires_at, ml_user_id FROM ml_credentials WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );

    if (!cred) {
      return reply.status(400).send({ error: 'Mercado Livre não conectado' });
    }

    if (new Date(cred.expires_at) < new Date()) {
      return reply.status(401).send({ error: 'Token ML expirado. Reconecte sua conta.' });
    }

    const body = request.body as {
      dimensions?: { height?: number; width?: number; length?: number };
      weight_kg?: number; item_price?: number; listing_type_id?: string;
      condition?: string; free_shipping?: boolean; logistic_type?: string;
      category_id?: string;
    } | null;

    if (!body?.dimensions && !body?.weight_kg) {
      return reply.status(400).send({ error: 'Dimensões e peso são obrigatórios para calcular o frete' });
    }

    // Build dimensions string
    const height = body?.dimensions?.height || 10;
    const width = body?.dimensions?.width || 10;
    const length = body?.dimensions?.length || 10;
    const weightGrams = Math.round((body?.weight_kg || 0.5) * 1000);
    const dimensionsStr = `${height}x${width}x${length},${weightGrams}`;

    const queryParams: Record<string, string> = {
      dimensions: dimensionsStr,
      item_price: String(body?.item_price || 100),
      listing_type_id: body?.listing_type_id || 'gold_special',
      mode: 'me2',
      condition: body?.condition || 'new',
      free_shipping: String(body?.free_shipping !== false),
      verbose: 'true',
      logistic_type: body?.logistic_type || 'drop_off',
    };

    if (body?.category_id) {
      queryParams.category_id = body.category_id;
    }

    const params = new URLSearchParams(queryParams);
    const url = `${ML_API}/users/${cred.ml_user_id}/shipping_options/free?${params.toString()}`;

    try {
      const mlResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
      });

      const mlData: any = await mlResponse.json();

      if (!mlResponse.ok) {
        logger.error({ status: mlResponse.status }, 'ML shipping cost error');
        return reply.status(400).send({
          error: 'Erro ao consultar custo de frete no ML',
          ml_error: mlData.message || JSON.stringify(mlData),
        });
      }

      // Extract cost
      let shippingCost = 0;

      if (mlData?.coverage?.all_country?.list_cost) {
        shippingCost = mlData.coverage.all_country.list_cost;
      }

      if (!shippingCost && mlData?.options?.length > 0) {
        const maxOption = mlData.options.reduce(
          (max: any, opt: any) => ((opt.list_cost || 0) > (max.list_cost || 0) ? opt : max),
          mlData.options[0],
        );
        shippingCost = maxOption?.list_cost || maxOption?.cost || 0;
      }

      if (!shippingCost && mlData?.list_cost) {
        shippingCost = mlData.list_cost;
      }

      const currencyId = mlData?.coverage?.all_country?.currency_id || 'BRL';
      const billableWeight = mlData?.coverage?.all_country?.billable_weight || 0;
      const discount = mlData?.coverage?.discount || null;

      return reply.send({
        shipping_cost: shippingCost,
        currency_id: currencyId,
        billable_weight: billableWeight,
        discount,
        dimensions_used: dimensionsStr,
        raw_coverage: mlData?.coverage || null,
      });
    } catch (err) {
      logger.error({ err }, 'ml-shipping-cost error');
      return reply.status(500).send({ error: 'Erro interno ao calcular frete' });
    }
  });

  // ─── Shipping Label ────────────────────────────────────────────────
  app.post('/api/ml/shipping-label', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = request.body as {
      action?: string; order_id?: string; shipment_id?: string;
    } | null;

    if (body?.action !== 'get_label') {
      return reply.status(400).send({ error: 'Ação inválida' });
    }

    try {
      // Get shipment record - try by shipment_id first, then order_id
      let shipment = await queryOne<{
        id: string; order_id: string; ml_shipment_id: string | null;
        tracking_code: string | null; tenant_id: string;
      }>(
        `SELECT s.id, s.order_id, s.ml_shipment_id, s.tracking_code, o.tenant_id
         FROM shipments s
         INNER JOIN orders o ON o.id = s.order_id
         WHERE s.id = $1
         LIMIT 1`,
        [body?.shipment_id || '']
      );

      if (!shipment && body?.order_id) {
        shipment = await queryOne(
          `SELECT s.id, s.order_id, s.ml_shipment_id, s.tracking_code, o.tenant_id
           FROM shipments s
           INNER JOIN orders o ON o.id = s.order_id
           WHERE s.order_id = $1
           LIMIT 1`,
          [body.order_id]
        );
      }

      if (!shipment) {
        return reply.status(404).send({ error: 'Envio não encontrado' });
      }

      if (!shipment.ml_shipment_id) {
        return reply.status(400).send({ error: 'Envio sem ID do Mercado Livre' });
      }

      // Get ML credentials for the tenant
      const cred = await queryOne<{ access_token: string; expires_at: string }>(
        `SELECT access_token, expires_at FROM ml_credentials WHERE tenant_id = $1 LIMIT 1`,
        [shipment.tenant_id]
      );

      if (!cred) {
        return reply.status(400).send({ error: 'Credenciais ML não encontradas' });
      }

      if (new Date(cred.expires_at) < new Date()) {
        return reply.status(401).send({ error: 'Token ML expirado' });
      }

      // Fetch shipment details from ML
      const shipRes = await fetch(`${ML_API}/shipments/${shipment.ml_shipment_id}`, {
        headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
      });

      if (!shipRes.ok) {
        logger.error({ mlShipmentId: shipment.ml_shipment_id, status: shipRes.status }, 'ML shipment fetch error');
        return reply.status(400).send({ error: 'Erro ao consultar envio no ML' });
      }

      const shipData: any = await shipRes.json();

      // Build label URL
      const labelApiUrl = `${ML_API}/shipment_labels?shipment_ids=${shipment.ml_shipment_id}&response_type=pdf&access_token=${cred.access_token}`;

      // Update shipment record with latest data
      const trackingCodeValue = shipData.tracking_number || shipment.tracking_code;
      const carrier = shipData.logistic_type || shipData.shipping_option?.name || 'Mercado Envios';

      if (shipData.status === 'shipped') {
        await query(
          `UPDATE shipments SET tracking_code = $1, carrier = $2, label_url = $3, shipped_at = $4, status = 'shipped', updated_at = NOW() WHERE id = $5`,
          [trackingCodeValue, carrier, labelApiUrl, shipData.status_history?.date_shipped || new Date().toISOString(), shipment.id]
        );
      } else if (shipData.status === 'delivered') {
        await query(
          `UPDATE shipments SET tracking_code = $1, carrier = $2, label_url = $3, delivered_at = $4, status = 'delivered', updated_at = NOW() WHERE id = $5`,
          [trackingCodeValue, carrier, labelApiUrl, shipData.status_history?.date_delivered || new Date().toISOString(), shipment.id]
        );
      } else if (shipData.status === 'ready_to_ship') {
        await query(
          `UPDATE shipments SET tracking_code = $1, carrier = $2, label_url = $3, status = 'ready', updated_at = NOW() WHERE id = $4`,
          [trackingCodeValue, carrier, labelApiUrl, shipment.id]
        );
      } else {
        await query(
          `UPDATE shipments SET tracking_code = $1, carrier = $2, label_url = $3, updated_at = NOW() WHERE id = $4`,
          [trackingCodeValue, carrier, labelApiUrl, shipment.id]
        );
      }

      return reply.send({
        label_url: labelApiUrl,
        tracking_code: shipData.tracking_number,
        carrier: shipData.logistic_type,
        status: shipData.status,
        receiver: shipData.receiver_address,
        dimensions: shipData.shipping_option?.dimensions,
      });
    } catch (err) {
      logger.error({ err }, 'ml-shipping-label error');
      return reply.status(500).send({ error: 'Erro interno ao buscar etiqueta' });
    }
  });

  // ─── Admin Overview ────────────────────────────────────────────────
  app.get('/api/ml/admin/overview', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request, reply) => {
    try {
      // Get credential stats
      const credStats = await queryOne<{ total: string; active: string; expired: string }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE expires_at > NOW()) as active,
           COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired
         FROM ml_credentials`
      );

      // Get listing stats
      const listingStats = await queryOne<{
        total: string; active: string; paused: string; closed: string; error_count: string;
      }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'active') as active,
           COUNT(*) FILTER (WHERE status = 'paused') as paused,
           COUNT(*) FILTER (WHERE status = 'closed') as closed,
           COUNT(*) FILTER (WHERE sync_status = 'error') as error_count
         FROM ml_listings`
      );

      // Get recent orders from ML
      const recentOrders = await queryMany<{
        id: string; order_number: string; status: string; total: number; created_at: string; tenant_id: string;
      }>(
        `SELECT id, order_number, status, total, created_at, tenant_id
         FROM orders
         WHERE ml_order_id IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 20`
      );

      // Get tenants with ML connected
      const connectedTenants = await queryMany<{
        tenant_id: string; ml_nickname: string | null; ml_user_id: string;
        expires_at: string; tenant_name: string | null;
      }>(
        `SELECT c.tenant_id, c.ml_nickname, c.ml_user_id, c.expires_at, t.name as tenant_name
         FROM ml_credentials c
         LEFT JOIN tenants t ON t.id = c.tenant_id
         ORDER BY c.updated_at DESC`
      );

      return reply.send({
        credentials: {
          total: Number(credStats?.total || 0),
          active: Number(credStats?.active || 0),
          expired: Number(credStats?.expired || 0),
        },
        listings: {
          total: Number(listingStats?.total || 0),
          active: Number(listingStats?.active || 0),
          paused: Number(listingStats?.paused || 0),
          closed: Number(listingStats?.closed || 0),
          errors: Number(listingStats?.error_count || 0),
        },
        recent_orders: recentOrders,
        connected_tenants: connectedTenants,
      });
    } catch (err) {
      logger.error({ err }, 'ml-admin-overview error');
      return reply.status(500).send({ error: 'Erro interno' });
    }
  });
}
