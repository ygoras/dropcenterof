import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { query, queryOne, queryMany } from '../../lib/db.js';
import { hmacSha256 } from '../../lib/crypto.js';
import { authMiddleware } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';

const ML_API = 'https://api.mercadolibre.com';

interface MlCredential {
  id: string;
  tenant_id: string;
  access_token: string;
  expires_at: string;
  ml_user_id: string;
}

// Check missed webhook feeds from ML to recover lost notifications
export async function checkMissedFeeds(): Promise<void> {
  if (!env.ML_APP_ID) return;
  try {
    const res = await fetch(`${ML_API}/missed_feeds?app_id=${env.ML_APP_ID}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data: any = await res.json();
    const results = data?.results || data || [];
    if (Array.isArray(results) && results.length > 0) {
      logger.info({ count: results.length }, 'Processing missed ML feeds');
      for (const feed of results) {
        if (feed?.topic && feed?.resource && feed?.user_id) {
          // Re-process missed notifications by simulating webhook call
          try {
            await fetch(`${env.APP_URL}/api/webhooks/ml`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic: feed.topic,
                resource: feed.resource,
                user_id: feed.user_id,
                application_id: env.ML_APP_ID,
              }),
            });
          } catch (replayErr) {
            logger.warn({ err: replayErr, resource: feed.resource }, 'Failed to replay missed feed');
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to check missed ML feeds');
  }
}

export async function registerMlWebhookRoutes(app: FastifyInstance) {
  // ─── Force sync all listings for a tenant (manual trigger) ─────────
  app.post('/api/ml/webhook/sync', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.status(400).send({ error: 'Perfil sem tenant' });
    }

    const cred = await queryOne<MlCredential>(
      `SELECT access_token, expires_at, ml_user_id FROM ml_credentials WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );

    if (!cred) {
      return reply.status(400).send({ error: 'Mercado Livre não conectado' });
    }

    if (new Date(cred.expires_at) < new Date()) {
      return reply.status(401).send({ error: 'Token ML expirado. Reconecte sua conta.' });
    }

    // Sync all listings that have ml_item_id
    const listings = await queryMany<{ id: string; ml_item_id: string }>(
      `SELECT id, ml_item_id FROM ml_listings WHERE tenant_id = $1 AND ml_item_id IS NOT NULL`,
      [tenantId]
    );

    let synced = 0;
    for (const listing of listings) {
      try {
        // Simulate an item notification to trigger full sync
        await handleItemNotification(cred, `/items/${listing.ml_item_id}`);
        synced++;
      } catch (err) {
        logger.warn({ err, mlItemId: listing.ml_item_id }, 'Failed to sync listing');
      }
    }

    return reply.send({ success: true, synced, total: listings.length });
  });

  // ─── ML Webhook (no auth - external webhook) ───────────────────────
  // CRITICAL: ML requires HTTP 200 within 500ms or it disables topics!
  // We respond immediately and process asynchronously.
  app.post('/api/webhooks/ml', { config: { rateLimit: { max: 1000, timeWindow: '1 minute' } } }, async (request, reply) => {
    // HMAC signature verification — MANDATORY in production
    const secret = env.ML_WEBHOOK_SECRET;
    if (env.NODE_ENV === 'production' && !secret) {
      logger.error('ML_WEBHOOK_SECRET missing in production — webhook rejected');
      return reply.status(503).send({ error: 'Webhook not configured' });
    }
    if (secret) {
      const signature = request.headers['x-signature'] as string | undefined;
      if (!signature) {
        if (env.NODE_ENV === 'production') {
          logger.warn('ML webhook missing x-signature header (prod)');
          return reply.status(401).send({ error: 'Missing signature' });
        }
      } else {
        const rawBody = JSON.stringify(request.body);
        const expected = hmacSha256(rawBody, secret);
        if (signature !== expected) {
          logger.warn('ML webhook signature mismatch');
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }
    }

    const body = request.body as { topic?: string; resource?: string; user_id?: number | string };
    const { topic, resource, user_id: mlUserId } = body;

    logger.info({ topic, resource, mlUserId }, 'ML webhook received');

    // RESPOND IMMEDIATELY with 200 — ML needs this within 500ms
    reply.send({ status: 'received' });

    // Process asynchronously AFTER responding
    setImmediate(async () => {
      try {
        const credential = await queryOne<MlCredential>(
          `SELECT id, tenant_id, access_token, expires_at, ml_user_id
           FROM ml_credentials
           WHERE ml_user_id = $1
           LIMIT 1`,
          [String(mlUserId)]
        );

        if (!credential) {
          logger.warn({ mlUserId }, 'Credential not found for ML user');
          return;
        }

        if (new Date(credential.expires_at) < new Date()) {
          logger.warn({ tenantId: credential.tenant_id }, 'Token expired, skipping webhook processing');
          return;
        }

        switch (topic) {
          case 'items':
            await handleItemNotification(credential, resource || '');
            break;
          case 'orders_v2':
          case 'orders':
            await handleOrderNotification(credential, resource || '');
            break;
          case 'shipments':
            await handleShipmentNotification(credential, resource || '');
            break;
          case 'questions':
            logger.info({ tenantId: credential.tenant_id, resource }, 'Question notification received');
            break;
          case 'claims':
            await handleClaimNotification(credential, resource || '');
            break;
          default:
            logger.info({ topic }, 'Unhandled ML webhook topic');
        }
      } catch (err) {
        logger.error({ err, topic, resource }, 'Async webhook processing error');
      }
    });
  });
}

// ─── HANDLE ITEM NOTIFICATION ────────────────────────────────────────
async function handleItemNotification(credential: MlCredential, resource: string) {
  const mlItemId = resource?.replace('/items/', '');
  if (!mlItemId) return;

  logger.info({ mlItemId, tenantId: credential.tenant_id }, 'Processing item notification');

  // Find matching listing in our DB
  const listing = await queryOne<{
    id: string; price: number; category_id: string; attributes: Record<string, unknown> | null;
  }>(
    `SELECT id, price, category_id, attributes
     FROM ml_listings
     WHERE ml_item_id = $1 AND tenant_id = $2
     LIMIT 1`,
    [mlItemId, credential.tenant_id]
  );

  if (!listing) {
    logger.info({ mlItemId }, 'No local listing found, skipping');
    return;
  }

  // 1. Fetch real item data from ML
  const itemRes = await fetch(`${ML_API}/items/${mlItemId}`, {
    headers: { Authorization: `Bearer ${credential.access_token}`, Accept: 'application/json' },
  });

  if (!itemRes.ok) {
    logger.error({ mlItemId, status: itemRes.status }, 'Failed to fetch item from ML');
    return;
  }

  const itemData: any = await itemRes.json();
  const newStatus: string = itemData.status;
  const listingTypeId: string = itemData.listing_type_id || (listing.attributes as any)?._listing_type_id || 'gold_pro';

  // 2. Fetch commission using listing_prices
  let saleFeeAmount = 0;
  try {
    const categoryId = listing.category_id || 'MLB1000';
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${listingTypeId}&currency_id=BRL`;
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${credential.access_token}`, Accept: 'application/json' },
    });
    if (feesRes.ok) {
      const feesData: any = await feesRes.json();
      if (Array.isArray(feesData)) {
        const feeEntry = feesData.find((f: any) => f.listing_type_id === listingTypeId) || feesData[0];
        if (feeEntry) saleFeeAmount = feeEntry.sale_fee_amount || 0;
      } else if (feesData?.sale_fee_amount) {
        saleFeeAmount = feesData.sale_fee_amount;
      }
    }
    // Fallback commission
    if (!saleFeeAmount && listing.price > 0) {
      const pct = listingTypeId === 'gold_pro' ? 0.165 : 0.13;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch fees for item notification');
  }

  // 3. Fetch shipping cost from item-specific endpoint
  let shippingCost = 0;
  try {
    const shippingRes = await fetch(`${ML_API}/items/${mlItemId}/shipping_options?zip_code=01310100`, {
      headers: { Authorization: `Bearer ${credential.access_token}`, Accept: 'application/json' },
    });
    if (shippingRes.ok) {
      const shippingData: any = await shippingRes.json();
      if (shippingData?.options?.length > 0) {
        const recommended = shippingData.options.find((o: any) => o.recommended) || shippingData.options[0];
        shippingCost = recommended?.list_cost || recommended?.cost || 0;
      }
      if (!shippingCost && shippingData?.coverage?.all_country?.list_cost) {
        shippingCost = shippingData.coverage.all_country.list_cost;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch shipping for item notification');
  }

  const netAmount = listing.price - saleFeeAmount - shippingCost;

  // 4. Update listing with real data
  const updatedAttrs = {
    ...(listing.attributes || {}),
    _ml_sale_fee: saleFeeAmount,
    _ml_shipping_cost: shippingCost,
    _ml_net_amount: netAmount,
    _listing_type_id: listingTypeId,
  };

  await query(
    `UPDATE ml_listings
     SET status = $1, sync_status = 'synced', last_sync_at = NOW(), updated_at = NOW(), attributes = $2
     WHERE id = $3`,
    [newStatus, JSON.stringify(updatedAttrs), listing.id]
  );

  logger.info({ listingId: listing.id, newStatus, saleFeeAmount, shippingCost, netAmount }, 'Listing updated from item notification');
}

// ─── HANDLE ORDER NOTIFICATION (orders_v2) ───────────────────────────
async function handleOrderNotification(credential: MlCredential, resource: string) {
  const mlOrderId = resource?.replace('/orders/', '');
  if (!mlOrderId) return;

  logger.info({ mlOrderId, tenantId: credential.tenant_id }, 'Processing order notification');

  // 1. Fetch order details from ML API
  const orderRes = await fetch(`${ML_API}/orders/${mlOrderId}`, {
    headers: {
      Authorization: `Bearer ${credential.access_token}`,
      Accept: 'application/json',
      'x-format-new': 'true',
    },
  });

  if (!orderRes.ok) {
    logger.error({ mlOrderId, status: orderRes.status }, 'Failed to fetch order from ML');
    return;
  }

  const orderData: any = await orderRes.json();

  // Map ML order status to our internal status
  const statusMap: Record<string, string> = {
    confirmed: 'approved',
    payment_required: 'pending',
    payment_in_process: 'pending',
    partially_paid: 'pending',
    paid: 'approved',
    partially_refunded: 'approved',
    pending_cancel: 'cancelled',
    cancelled: 'cancelled',
  };

  let mappedStatus = statusMap[orderData.status] || orderData.status;

  // 2. Extract buyer info
  const buyer = orderData.buyer || {};
  const customerName = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || 'Comprador ML';
  const customerEmail: string | null = buyer.email || null;
  const customerPhone: string | null = buyer.phone?.number
    ? `${buyer.phone.area_code || ''}${buyer.phone.number}`
    : null;
  const customerDocument: string | null = buyer.billing_info?.doc_number || null;

  // 3. Build order items from ML order_items
  const orderItems: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    ml_item_id: string | null;
  }> = (orderData.order_items || []).map((item: any) => ({
    product_id: '',
    product_name: item.item?.title || 'Produto ML',
    sku: item.item?.seller_sku || item.item?.id || '',
    quantity: item.quantity || 1,
    unit_price: item.unit_price || 0,
    ml_item_id: item.item?.id || null,
  }));

  // Try to match ML items to our products via ml_listings
  for (const orderItem of orderItems) {
    if (orderItem.ml_item_id) {
      const listing = await queryOne<{ product_id: string }>(
        `SELECT product_id FROM ml_listings WHERE ml_item_id = $1 AND tenant_id = $2 LIMIT 1`,
        [orderItem.ml_item_id, credential.tenant_id]
      );

      if (listing) {
        orderItem.product_id = listing.product_id;

        const product = await queryOne<{ sku: string }>(
          `SELECT sku FROM products WHERE id = $1 LIMIT 1`,
          [listing.product_id]
        );
        if (product?.sku) {
          orderItem.sku = product.sku;
        }
      }
    }
  }

  // Skip orders where NO items match registered listings
  const hasRegisteredItems = orderItems.some(item => !!item.product_id);
  if (!hasRegisteredItems) {
    logger.info({ mlOrderId: mlOrderId, tenantId: credential.tenant_id }, 'Order skipped — no items registered in ml_listings');
    return;
  }

  // Skip orders created BEFORE the listing was registered/imported
  for (const orderItem of orderItems) {
    if (orderItem.product_id && orderItem.ml_item_id) {
      const listingDate = await queryOne<{ created_at: string }>(
        `SELECT created_at FROM ml_listings WHERE ml_item_id = $1 AND tenant_id = $2 LIMIT 1`,
        [orderItem.ml_item_id, credential.tenant_id]
      );
      if (listingDate && orderData.date_created) {
        const orderCreated = new Date(orderData.date_created);
        const listingCreated = new Date(listingDate.created_at);
        if (orderCreated < listingCreated) {
          logger.info({ mlOrderId: mlOrderId, orderDate: orderData.date_created, listingDate: listingDate.created_at }, 'Order skipped — created before listing registration');
          return;
        }
      }
    }
  }

  // 4. Calculate totals
  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price, 0
  );

  // ML sale_fee per item × quantity = total ML commission charged to the seller
  // The order resource already returns sale_fee per unit on each order_item — no extra API call.
  const mlFee = (orderData.order_items || []).reduce(
    (sum: number, oi: any) => sum + Number(oi.sale_fee ?? 0) * Number(oi.quantity ?? 0),
    0
  );

  // Fetch shipping info
  let shippingCost = 0;
  // Seller's shipping cost — what the seller is responsible for (free-shipping subsidy in ME2).
  // Reads list_cost first (full price seller would pay if subsidizing), then falls back to cost.
  let sellerShippingCost = 0;
  let shippingAddress: Record<string, string> | null = null;
  let trackingCode: string | null = null;
  let logisticTypeFromOrder: string | null = null;
  let shippingModeFromOrder: string | null = null;

  if (orderData.shipping?.id) {
    try {
      const shipRes = await fetch(`${ML_API}/shipments/${orderData.shipping.id}`, {
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          Accept: 'application/json',
          'x-format-new': 'true',
        },
      });
      if (shipRes.ok) {
        const shipData: any = await shipRes.json();

        shippingCost = shipData.shipping_option?.cost || shipData.cost || 0;
        sellerShippingCost = Number(
          shipData?.shipping_option?.list_cost
          ?? shipData?.shipping_option?.cost
          ?? shipData?.lead_time?.cost
          ?? 0
        );
        trackingCode = shipData.tracking_number || null;
        logisticTypeFromOrder = shipData.logistic_type || shipData.logistic?.type || null;
        shippingModeFromOrder = shipData.mode || shipData.logistic?.mode || null;

        const receiver = shipData.receiver_address || {};
        if (receiver.street_name) {
          shippingAddress = {
            street: `${receiver.street_name} ${receiver.street_number || ''}`.trim(),
            city: receiver.city?.name || '',
            state: receiver.state?.name || '',
            zip: receiver.zip_code || '',
          };
        }

        // NOTE: Shipment status logic is placed AFTER orderPayload is built below (bug fix)
      }
    } catch (err) {
      logger.warn({ err }, 'Could not fetch shipment details');
    }
  }

  const total = orderData.total_amount || subtotal + shippingCost;

  // 5. Generate order number
  const orderNumber = `ML-${mlOrderId}`;

  // 6. Build order payload
  const orderPayload = {
    tenant_id: credential.tenant_id,
    order_number: orderNumber,
    customer_name: customerName,
    customer_document: customerDocument,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    status: mappedStatus,
    items: orderItems,
    subtotal,
    shipping_cost: shippingCost,
    seller_shipping_cost: sellerShippingCost,
    ml_fee: mlFee,
    total,
    shipping_address: shippingAddress,
    tracking_code: trackingCode,
    ml_order_id: String(mlOrderId),
    ml_credential_id: credential.id,
    ml_status: orderData.status || null,
    notes: `Pedido originado do Mercado Livre. Pack ID: ${orderData.pack_id || 'N/A'}`,
  };

  // Apply shipment status
  if (orderData.shipping?.id) {
    try {
      const shipRes = await fetch(`${ML_API}/shipments/${orderData.shipping.id}`, {
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          Accept: 'application/json',
        },
      });
      if (shipRes.ok) {
        const shipData: any = await shipRes.json();
        if (shipData.status === 'shipped' && mappedStatus !== 'cancelled') {
          orderPayload.status = 'shipped';
          if (shipData.tracking_number) {
            orderPayload.tracking_code = shipData.tracking_number;
          }
        } else if (shipData.status === 'delivered' && mappedStatus !== 'cancelled') {
          orderPayload.status = 'delivered';
        }
      }
    } catch {
      // Already fetched above, just updating status
    }
  }

  // Status priority map for conflict resolution
  const statusPriority: Record<string, number> = {
    pending: 0, pending_credit: 1, approved: 2, invoiced: 3,
    picking: 4, packing: 5, packed: 6, shipped: 7, delivered: 8, cancelled: 9,
  };

  // 7. UPSERT: Insert or update order atomically (prevents duplicates)
  const upsertResult = await queryOne<{ id: string; is_new: boolean; final_status: string }>(
    `INSERT INTO orders (
      tenant_id, order_number, customer_name, customer_document, customer_email, customer_phone,
      status, items, subtotal, shipping_cost, total, shipping_address, tracking_code,
      ml_order_id, ml_credential_id, notes, ml_status, shipping_mode,
      ml_fee, seller_shipping_cost,
      created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
    ON CONFLICT (ml_order_id, tenant_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_document = EXCLUDED.customer_document,
      customer_email = EXCLUDED.customer_email,
      customer_phone = EXCLUDED.customer_phone,
      status = CASE
        WHEN EXCLUDED.status = 'cancelled' THEN 'cancelled'
        WHEN EXCLUDED.status = 'delivered' THEN 'delivered'
        WHEN EXCLUDED.status = 'shipped' AND orders.status NOT IN ('delivered', 'cancelled') THEN 'shipped'
        WHEN (
          CASE EXCLUDED.status
            WHEN 'pending' THEN 0 WHEN 'pending_credit' THEN 1 WHEN 'approved' THEN 2
            WHEN 'invoiced' THEN 3 WHEN 'picking' THEN 4 WHEN 'packing' THEN 5
            WHEN 'packed' THEN 6 WHEN 'shipped' THEN 7 WHEN 'delivered' THEN 8 WHEN 'cancelled' THEN 9
            ELSE 0
          END
        ) >= (
          CASE orders.status
            WHEN 'pending' THEN 0 WHEN 'pending_credit' THEN 1 WHEN 'approved' THEN 2
            WHEN 'invoiced' THEN 3 WHEN 'picking' THEN 4 WHEN 'packing' THEN 5
            WHEN 'packed' THEN 6 WHEN 'shipped' THEN 7 WHEN 'delivered' THEN 8 WHEN 'cancelled' THEN 9
            ELSE 0
          END
        ) THEN EXCLUDED.status
        ELSE orders.status
      END,
      items = EXCLUDED.items,
      subtotal = EXCLUDED.subtotal,
      shipping_cost = EXCLUDED.shipping_cost,
      total = EXCLUDED.total,
      shipping_address = EXCLUDED.shipping_address,
      tracking_code = COALESCE(EXCLUDED.tracking_code, orders.tracking_code),
      notes = EXCLUDED.notes,
      ml_status = COALESCE(EXCLUDED.ml_status, orders.ml_status),
      shipping_mode = COALESCE(EXCLUDED.shipping_mode, orders.shipping_mode),
      -- Idempotente: só preenche ml_fee/seller_shipping_cost se ainda for NULL (não sobrescreve ajustes manuais)
      ml_fee = COALESCE(orders.ml_fee, EXCLUDED.ml_fee),
      seller_shipping_cost = COALESCE(orders.seller_shipping_cost, EXCLUDED.seller_shipping_cost),
      updated_at = NOW()
    RETURNING id, (xmax = 0) AS is_new, status AS final_status`,
    [
      orderPayload.tenant_id, orderPayload.order_number,
      orderPayload.customer_name, orderPayload.customer_document,
      orderPayload.customer_email, orderPayload.customer_phone,
      orderPayload.status, JSON.stringify(orderPayload.items),
      orderPayload.subtotal, orderPayload.shipping_cost, orderPayload.total,
      orderPayload.shipping_address ? JSON.stringify(orderPayload.shipping_address) : null,
      orderPayload.tracking_code, orderPayload.ml_order_id,
      orderPayload.ml_credential_id, orderPayload.notes,
      orderPayload.ml_status,
      shippingModeFromOrder,
      orderPayload.ml_fee,
      orderPayload.seller_shipping_cost,
      orderData.date_created || new Date().toISOString(),
    ]
  );

  const isNewOrder = upsertResult?.is_new ?? false;
  const orderId = upsertResult?.id;
  const finalStatus = upsertResult?.final_status ?? orderPayload.status;

  if (isNewOrder) {
    logger.info({ orderNumber, orderId, tenantId: credential.tenant_id }, 'Created new order');
  } else {
    logger.info({ orderId, finalStatus }, 'Updated existing order');
  }

  // Update mappedStatus to reflect what was actually saved
  mappedStatus = finalStatus;

  // 8. CREDIT CHECK: For approved NEW orders, verify seller has enough credit
  if (mappedStatus === 'approved' && isNewOrder) {
    let totalCostPrice = 0;
    for (const item of orderItems) {
      if (!item.product_id) continue;
      const product = await queryOne<{ sell_price: number }>(
        `SELECT sell_price FROM products WHERE id = $1`,
        [item.product_id]
      );
      if (product) {
        totalCostPrice += (product.sell_price || 0) * (item.quantity || 1);
      }
    }

    if (totalCostPrice > 0) {
      // Try to debit from wallet — PL/pgSQL returns JSONB: {success, reason?, balance, transaction_id}
      const debitRow = await queryOne<{ debit_wallet: any }>(
        `SELECT debit_wallet($1, $2, $3, $4, $5)`,
        [credential.tenant_id, totalCostPrice, `Custo produto - ${orderNumber}`, null, 'order']
      );

      const debitResult = typeof debitRow?.debit_wallet === 'string'
        ? JSON.parse(debitRow.debit_wallet)
        : debitRow?.debit_wallet;

      if (!debitResult?.success) {
        logger.info({ tenantId: credential.tenant_id, totalCostPrice }, 'Insufficient credit for order');

        // Update the order to pending_credit
        await query(
          `UPDATE orders SET status = 'pending_credit', updated_at = NOW()
           WHERE ml_order_id = $1 AND tenant_id = $2`,
          [String(mlOrderId), credential.tenant_id]
        );

        mappedStatus = 'pending_credit';

        // Notify seller about blocked order
        try {
          await query(
            `SELECT create_notification($1, $2, $3, $4, $5, $6)`,
            [
              credential.tenant_id,
              'order_blocked',
              'Pedido bloqueado por crédito',
              `O pedido #${orderNumber} precisa de R$ ${totalCostPrice.toFixed(2)} mas seu saldo é insuficiente. Recarregue sua carteira.`,
              '/seller/credito',
              JSON.stringify({ order_number: orderNumber, cost: totalCostPrice }),
            ]
          );
        } catch (notifErr) {
          logger.warn({ err: notifErr }, 'Failed to create notification');
        }
      } else {
        logger.info({ tenantId: credential.tenant_id, totalCostPrice, balance: debitResult.balance }, 'Wallet debited');
      }
    }
  }

  // 9. Update stock (reserve) for approved NEW orders (NOT pending_credit)
  if (mappedStatus === 'approved' && isNewOrder) {
    for (const item of orderItems) {
      if (!item.product_id) continue;

      const stockRow = await queryOne<{ id: string; reserved: number }>(
        `SELECT id, reserved FROM stock WHERE product_id = $1 LIMIT 1`,
        [item.product_id]
      );

      if (stockRow) {
        await query(
          `UPDATE stock SET reserved = $1, updated_at = NOW() WHERE id = $2`,
          [(stockRow.reserved || 0) + item.quantity, stockRow.id]
        );

        logger.info({ productId: item.product_id, quantity: item.quantity }, 'Reserved stock');

        // Trigger stock check via internal call
        try {
          await handleStockCheckInternal(item.product_id);
        } catch (err) {
          logger.warn({ err }, 'Stock check trigger failed');
        }
      }
    }
  }

  // 10. Auto-create picking_task for approved orders (NOT pending_credit)
  if (mappedStatus === 'approved' && orderId) {
    // Create picking task if not exists
    const existingTask = await queryOne<{ id: string }>(
      `SELECT id FROM picking_tasks WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );

    if (!existingTask) {
      await query(
        `INSERT INTO picking_tasks (order_id, status) VALUES ($1, 'pending')`,
        [orderId]
      );
      logger.info({ orderId }, 'Auto-created picking task');
    }

    // Also create shipment record if shipping info available
    if (orderData.shipping?.id) {
      const existingShipment = await queryOne<{ id: string }>(
        `SELECT id FROM shipments WHERE order_id = $1 LIMIT 1`,
        [orderId]
      );

      if (!existingShipment) {
        await query(
          `INSERT INTO shipments (order_id, tenant_id, carrier, tracking_code, status, ml_shipment_id, logistic_type, shipping_mode)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)`,
          [orderId, credential.tenant_id, logisticTypeFromOrder || 'Mercado Envios', trackingCode, String(orderData.shipping.id), logisticTypeFromOrder, shippingModeFromOrder]
        );
        logger.info({ orderId, mlShipmentId: orderData.shipping.id, logisticType: logisticTypeFromOrder, shippingMode: shippingModeFromOrder }, 'Auto-created shipment');
      }
    }
  }

  logger.info({ orderNumber, status: mappedStatus }, 'Order webhook processed');
}

// ─── HANDLE SHIPMENT NOTIFICATION ────────────────────────────────────
async function handleShipmentNotification(credential: MlCredential, resource: string) {
  const mlShipmentId = resource?.replace('/shipments/', '');
  if (!mlShipmentId) return;

  logger.info({ mlShipmentId, tenantId: credential.tenant_id }, 'Processing shipment notification');

  // Fetch shipment details from ML
  const shipRes = await fetch(`${ML_API}/shipments/${mlShipmentId}`, {
    headers: {
      Authorization: `Bearer ${credential.access_token}`,
      Accept: 'application/json',
    },
  });

  if (!shipRes.ok) {
    logger.error({ mlShipmentId, status: shipRes.status }, 'Failed to fetch shipment from ML');
    return;
  }

  const shipData: any = await shipRes.json();

  // Find our shipment record
  const shipment = await queryOne<{ id: string; order_id: string }>(
    `SELECT id, order_id FROM shipments WHERE ml_shipment_id = $1 LIMIT 1`,
    [String(mlShipmentId)]
  );

  if (!shipment) {
    logger.info({ mlShipmentId }, 'No local shipment found');
    return;
  }

  // Map ML shipment status to our order status
  const shipmentStatusMap: Record<string, string> = {
    shipped: 'shipped',
    delivered: 'delivered',
  };

  // Build label URL (always available once shipment exists)
  const labelUrl = `${ML_API}/shipment_labels?shipment_ids=${mlShipmentId}&response_type=pdf&access_token=${credential.access_token}`;
  const trackingCode = shipData.tracking_number || null;
  const logisticType = shipData.logistic_type || shipData.logistic?.type || null;
  const shippingMode = shipData.mode || shipData.logistic?.mode || null;
  const carrier = logisticType || shipData.shipping_option?.name || 'Mercado Envios';

  const newOrderStatus = shipmentStatusMap[shipData.status];

  if (newOrderStatus) {
    // Update order status + shipping_mode
    await query(
      `UPDATE orders SET status = $1, tracking_code = $2, shipping_mode = COALESCE($3, shipping_mode), updated_at = NOW() WHERE id = $4`,
      [newOrderStatus, trackingCode, shippingMode, shipment.order_id]
    );

    // Update shipment record with label_url, tracking, carrier, logistic_type, shipping_mode
    if (newOrderStatus === 'shipped') {
      await query(
        `UPDATE shipments SET status = $1, tracking_code = $2, carrier = $3, label_url = $4, logistic_type = $5, shipping_mode = $6, shipped_at = NOW(), updated_at = NOW() WHERE id = $7`,
        [newOrderStatus, trackingCode, carrier, labelUrl, logisticType, shippingMode, shipment.id]
      );
    } else if (newOrderStatus === 'delivered') {
      await query(
        `UPDATE shipments SET status = $1, tracking_code = $2, carrier = $3, label_url = $4, logistic_type = $5, shipping_mode = $6, delivered_at = NOW(), updated_at = NOW() WHERE id = $7`,
        [newOrderStatus, trackingCode, carrier, labelUrl, logisticType, shippingMode, shipment.id]
      );
    } else {
      await query(
        `UPDATE shipments SET status = $1, tracking_code = $2, carrier = $3, label_url = $4, logistic_type = $5, shipping_mode = $6, updated_at = NOW() WHERE id = $7`,
        [newOrderStatus, trackingCode, carrier, labelUrl, logisticType, shippingMode, shipment.id]
      );
    }

    logger.info({ mlShipmentId, orderId: shipment.order_id, newOrderStatus, logisticType, shippingMode, hasLabel: !!labelUrl }, 'Shipment status updated');
  } else {
    // Even if no status change, still save label_url if we don't have one
    await query(
      `UPDATE shipments SET label_url = COALESCE(label_url, $1), tracking_code = COALESCE(tracking_code, $2), carrier = COALESCE(carrier, $3), logistic_type = COALESCE(logistic_type, $4), shipping_mode = COALESCE(shipping_mode, $5), updated_at = NOW() WHERE id = $6`,
      [labelUrl, trackingCode, carrier, logisticType, shippingMode, shipment.id]
    );
    // Also propagate mode to orders
    if (shippingMode) {
      await query(
        `UPDATE orders SET shipping_mode = COALESCE(shipping_mode, $1), updated_at = NOW() WHERE id = $2`,
        [shippingMode, shipment.order_id]
      );
    }
    logger.info({ mlShipmentId, shipDataStatus: shipData.status, logisticType, shippingMode }, 'Shipment label_url saved (no status change)');
  }
}

// ─── INTERNAL STOCK CHECK (called from order handler) ────────────────
async function handleStockCheckInternal(productId: string) {
  const listings = await queryMany<{
    id: string; ml_item_id: string | null; product_id: string;
    tenant_id: string; status: string; attributes: Record<string, unknown> | null;
    ml_credential_id: string | null;
  }>(
    `SELECT id, ml_item_id, product_id, tenant_id, status, attributes, ml_credential_id
     FROM ml_listings
     WHERE product_id = $1 AND status IN ('active', 'paused')`,
    [productId]
  );

  if (!listings || listings.length === 0) return;

  for (const listing of listings) {
    const stockData = await queryOne<{ available: number }>(
      `SELECT available FROM available_stock WHERE product_id = $1 AND tenant_id = $2 LIMIT 1`,
      [listing.product_id, listing.tenant_id]
    );

    const available = stockData?.available || 0;
    const minStock = Number((listing.attributes as any)?._min_stock || 0);

    if (available <= minStock && listing.status === 'active' && listing.ml_item_id) {
      const cred = await resolveCredential(listing.ml_credential_id, listing.tenant_id);
      if (cred) {
        try {
          await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${cred.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'paused' }),
          });
          await query(
            `UPDATE ml_listings SET status = 'paused', updated_at = NOW() WHERE id = $1`,
            [listing.id]
          );
        } catch (err) {
          logger.warn({ err, listingId: listing.id }, 'Failed to pause listing on low stock');
        }
      }
    } else if (available > minStock && listing.status === 'paused' && listing.ml_item_id) {
      const cred = await resolveCredential(listing.ml_credential_id, listing.tenant_id);
      if (cred) {
        try {
          await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${cred.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' }),
          });
          await query(
            `UPDATE ml_listings SET status = 'active', updated_at = NOW() WHERE id = $1`,
            [listing.id]
          );
        } catch (err) {
          logger.warn({ err, listingId: listing.id }, 'Failed to activate listing on stock available');
        }
      }
    }
  }
}

async function resolveCredential(mlCredentialId: string | null, tenantId: string) {
  if (mlCredentialId) {
    const cred = await queryOne<{ access_token: string }>(
      `SELECT access_token FROM ml_credentials WHERE id = $1 LIMIT 1`,
      [mlCredentialId]
    );
    if (cred) return cred;
  }
  return queryOne<{ access_token: string }>(
    `SELECT access_token FROM ml_credentials WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
    [tenantId]
  );
}

// ─── HANDLE CLAIM NOTIFICATION ─────────────────────────────────────
async function handleClaimNotification(credential: MlCredential, resource: string) {
  const ML_API = 'https://api.mercadolibre.com';

  // resource is like /claims/123456789
  const claimIdMatch = resource.match(/\d+/);
  if (!claimIdMatch) {
    logger.warn({ resource }, 'Could not extract claim ID');
    return;
  }
  const claimId = claimIdMatch[0];

  try {
    // Fetch claim details from ML API
    const claimRes = await fetch(`${ML_API}/claims/${claimId}`, {
      headers: { Authorization: `Bearer ${credential.access_token}` },
    });

    if (!claimRes.ok) {
      logger.warn({ claimId, status: claimRes.status }, 'Failed to fetch claim from ML');
      return;
    }

    const claimData: any = await claimRes.json();
    const mlOrderId = claimData.resource_id?.toString() || null;
    const claimStatus = claimData.status || 'opened'; // opened, closed, etc.

    if (!mlOrderId) {
      logger.warn({ claimId }, 'Claim has no associated order');
      return;
    }

    // Update order with claim status
    const updated = await queryOne(
      `UPDATE orders SET claim_status = $1, updated_at = NOW()
       WHERE ml_order_id = $2 AND tenant_id = $3
       RETURNING id, status, order_number`,
      [claimStatus, mlOrderId, credential.tenant_id]
    );

    if (updated) {
      logger.info({ claimId, mlOrderId, claimStatus, orderId: (updated as any).id }, 'Order claim status updated');
    } else {
      logger.info({ claimId, mlOrderId }, 'Claim received but no matching order found');
    }
  } catch (err) {
    logger.error({ err, claimId }, 'Error processing claim notification');
  }
}
