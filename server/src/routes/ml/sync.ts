import type { FastifyInstance } from 'fastify';
import { query, queryOne, queryMany } from '../../lib/db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';

const ML_API = 'https://api.mercadolibre.com';

interface MlCredRow {
  id: string;
  tenant_id: string;
  access_token: string;
  expires_at: string;
  ml_user_id: string;
}

export async function registerMlSyncRoutes(app: FastifyInstance) {
  // ─── ML Sync ───────────────────────────────────────────────────────
  app.post('/api/ml/sync', async (request, reply) => {
    const body = request.body as {
      action?: string; listing_id?: string; product_id?: string;
      ml_credential_id?: string; listing_type_id?: string;
      price?: number; category_id?: string; ml_item_id?: string;
    };
    const { action, listing_id: listingId } = body;

    try {
      // stock_check does NOT require auth (internal call)
      if (action === 'stock_check') {
        return await handleStockCheck(body.product_id, reply);
      }

      // All other actions require auth
      if (!request.user) {
        // Run auth manually since this route has mixed auth requirements
        await new Promise<void>((resolve, reject) => {
          authMiddleware(request, reply).then(resolve).catch(reject);
        });
        if (reply.sent) return;
      }

      const tenantId = request.user?.tenantId;
      if (!tenantId) {
        return reply.status(400).send({ error: 'Perfil sem tenant' });
      }

      // Resolve credential
      const cred = await resolveCredential(listingId, body.ml_credential_id, tenantId, action);
      if (!cred) {
        return reply.status(400).send({ error: 'Mercado Livre não conectado' });
      }

      if (new Date(cred.expires_at) < new Date()) {
        return reply.status(401).send({ error: 'Token ML expirado. Reconecte sua conta.' });
      }

      switch (action) {
        case 'publish':
          return await handlePublish(cred, tenantId, listingId!, reply);
        case 'update':
          return await handleUpdate(cred, listingId!, body.listing_type_id, reply);
        case 'pause':
          return await handleStatusChange(cred, listingId!, 'paused', reply);
        case 'activate':
          return await handleStatusChange(cred, listingId!, 'active', reply);
        case 'close':
          return await handleClose(cred, listingId!, reply);
        case 'get_fees':
          return await handleGetFees(cred, body, reply);
        case 'refresh':
          return await handleRefresh(cred, listingId!, reply);
        case 'import':
          return await handleImport(cred, tenantId, body.ml_item_id!, body.product_id!, reply);
        default:
          return reply.status(400).send({ error: 'Ação inválida' });
      }
    } catch (err) {
      logger.error({ err }, 'ml-sync error');
      return reply.status(500).send({ error: 'Erro interno no sync' });
    }
  });

  // Apply auth preHandler only for non-stock_check calls
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.routeOptions?.url === '/api/ml/sync' &&
      request.method === 'POST'
    ) {
      // We'll handle auth inside the route handler since stock_check doesn't need it
      return;
    }
  });
}

// ─── RESOLVE CREDENTIAL ──────────────────────────────────────────────
async function resolveCredential(
  listingId: string | undefined,
  mlCredentialId: string | undefined,
  tenantId: string,
  action: string | undefined,
): Promise<MlCredRow | null> {
  let cred: MlCredRow | null = null;

  if (listingId && action !== 'get_fees') {
    const listing = await queryOne<{ ml_credential_id: string | null }>(
      `SELECT ml_credential_id FROM ml_listings WHERE id = $1 LIMIT 1`,
      [listingId]
    );
    if (listing?.ml_credential_id) {
      cred = await queryOne<MlCredRow>(
        `SELECT id, tenant_id, access_token, expires_at, ml_user_id FROM ml_credentials WHERE id = $1 LIMIT 1`,
        [listing.ml_credential_id]
      );
    }
  }

  if (!cred && mlCredentialId) {
    cred = await queryOne<MlCredRow>(
      `SELECT id, tenant_id, access_token, expires_at, ml_user_id FROM ml_credentials WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [mlCredentialId, tenantId]
    );
  }

  if (!cred) {
    cred = await queryOne<MlCredRow>(
      `SELECT id, tenant_id, access_token, expires_at, ml_user_id FROM ml_credentials WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
      [tenantId]
    );
  }

  return cred;
}

// ─── PUBLISH ─────────────────────────────────────────────────────────
async function handlePublish(cred: MlCredRow, tenantId: string, listingId: string, reply: any) {
  const listing = await queryOne<any>(
    `SELECT l.*,
       json_build_object(
         'name', p.name, 'description', p.description, 'sell_price', p.sell_price,
         'images', p.images, 'brand', p.brand, 'category', p.category,
         'weight_kg', p.weight_kg, 'dimensions', p.dimensions, 'sku', p.sku,
         'condition', p.condition, 'gtin', p.gtin, 'warranty_type', p.warranty_type,
         'warranty_time', p.warranty_time, 'ml_category_id', p.ml_category_id,
         'attributes', p.attributes
       ) as products
     FROM ml_listings l
     LEFT JOIN products p ON p.id = l.product_id
     WHERE l.id = $1 AND l.tenant_id = $2
     LIMIT 1`,
    [listingId, tenantId]
  );

  if (!listing) {
    return reply.status(404).send({ error: 'Anúncio não encontrado' });
  }

  if (listing.ml_item_id) {
    return reply.status(400).send({ error: 'Anúncio já publicado no ML', ml_item_id: listing.ml_item_id });
  }

  const product = listing.products;
  const listingAttrs = listing.attributes || {};

  // Validate required fields
  const categoryId = listing.category_id || product?.ml_category_id;
  if (!categoryId) {
    return reply.status(400).send({ error: 'Categoria ML é obrigatória para publicar o anúncio' });
  }

  const listingTypeId = listingAttrs._listing_type_id || 'gold_pro';
  const itemCondition = listingAttrs._condition || product?.condition || 'new';
  const warrantyType = listingAttrs._warranty_type || product?.warranty_type || 'Garantia do vendedor';
  const warrantyTime = listingAttrs._warranty_time || product?.warranty_time || '90 dias';
  const sellerSku = listingAttrs._seller_sku || product?.sku;
  const freeShipping = listingAttrs._free_shipping === true;
  const productAttrs = product?.attributes as Record<string, unknown> | null;
  const availableQty = Number(productAttrs?._available_quantity || listingAttrs._available_quantity || 1);

  const conditionMap: Record<string, string> = {
    new: '2230284',
    used: '2230581',
    refurbished: '2230582',
  };

  const mlPayload: Record<string, unknown> = {
    title: listing.title,
    category_id: listing.category_id || product?.ml_category_id,
    price: listing.price,
    currency_id: 'BRL',
    available_quantity: Math.max(availableQty, 1),
    buying_mode: 'buy_it_now',
    condition: itemCondition === 'refurbished' ? 'new' : itemCondition,
    listing_type_id: listingTypeId,
    channels: ['marketplace'],
    sale_terms: [
      { id: 'WARRANTY_TYPE', value_name: warrantyType },
      { id: 'WARRANTY_TIME', value_name: warrantyTime },
    ],
    pictures: (product?.images || []).map((url: string) => ({ source: url })),
  };

  const shippingObj: Record<string, unknown> = {
    mode: 'me2',
    local_pick_up: false,
    free_shipping: freeShipping,
  };

  // Free shipping requires free_methods for national coverage
  if (freeShipping) {
    shippingObj.free_methods = [
      { id: 73328, rule: { free_mode: 'country', value: null } },
    ];
  }

  if (product?.dimensions && product?.weight_kg) {
    const dims = product.dimensions as { height?: number; width?: number; length?: number };
    const h = dims.height || 10;
    const w = dims.width || 10;
    const l = dims.length || 10;
    const weightGrams = Math.round((product.weight_kg || 0.5) * 1000);
    shippingObj.dimensions = `${h}x${w}x${l},${weightGrams}`;
  }
  mlPayload.shipping = shippingObj;

  // Build ML attributes
  const mlAttributes: Array<Record<string, string>> = [];

  if (conditionMap[itemCondition]) {
    mlAttributes.push({ id: 'ITEM_CONDITION', value_id: conditionMap[itemCondition] });
  }

  if (sellerSku) {
    mlAttributes.push({ id: 'SELLER_SKU', value_name: sellerSku });
  }

  // BRAND — required by most ML categories
  const brand = listingAttrs._brand || product?.brand;
  if (brand) {
    mlAttributes.push({ id: 'BRAND', value_name: String(brand) });
  }

  // GTIN/EAN — strongly recommended, increasingly required
  const gtin = product?.gtin;
  if (gtin) {
    mlAttributes.push({ id: 'GTIN', value_name: String(gtin) });
  }

  if (listingAttrs && typeof listingAttrs === 'object') {
    for (const [id, value] of Object.entries(listingAttrs)) {
      if (id.startsWith('_')) continue;
      const alreadyAdded = mlAttributes.some((a) => a.id === id);
      if (!alreadyAdded && value) {
        mlAttributes.push({ id, value_name: String(value) });
      }
    }
  }

  if (productAttrs && typeof productAttrs === 'object') {
    for (const [id, value] of Object.entries(productAttrs)) {
      if (id.startsWith('_')) continue;
      const alreadyAdded = mlAttributes.some((a) => a.id === id);
      if (!alreadyAdded && value) {
        mlAttributes.push({ id, value_name: String(value) });
      }
    }
  }

  if (mlAttributes.length > 0) {
    mlPayload.attributes = mlAttributes;
  }

  logger.debug({ listingId }, 'Publishing to ML');

  const mlResponse = await fetch(`${ML_API}/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(mlPayload),
  });

  const mlData: any = await mlResponse.json();

  if (!mlResponse.ok) {
    logger.error({ listingId, mlError: mlData.message }, 'ML publish error');

    const causes = mlData.cause || [];
    const missingAttrs = causes
      .filter((c: any) => c.code === 'item.attributes.missing_required')
      .map((c: any) => c.message)
      .join('; ');

    const errorMsg = missingAttrs
      ? `Atributos obrigatórios faltando: ${missingAttrs}`
      : mlData.message || 'Erro desconhecido';

    const updatedAttrs = { ...(listing.attributes || {}), _last_error: errorMsg };
    await query(
      `UPDATE ml_listings SET sync_status = 'error', attributes = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedAttrs), listingId]
    );

    return reply.status(400).send({
      error: 'Erro ao publicar no Mercado Livre',
      ml_error: errorMsg,
      ml_details: causes,
    });
  }

  // Post description — listing description (seller-customized) takes priority over product description
  const itemDescription = listing.description || product?.description;
  if (itemDescription && mlData.id) {
    try {
      const descRes = await fetch(`${ML_API}/items/${mlData.id}/description`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ plain_text: itemDescription }),
      });
      if (!descRes.ok) {
        // Try PUT as fallback
        await fetch(`${ML_API}/items/${mlData.id}/description`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${cred.access_token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ plain_text: itemDescription }),
        });
      }
    } catch (err) {
      logger.warn({ err, mlItemId: mlData.id }, 'Error sending description to ML');
    }
  }

  // Fetch real data from the published item
  let saleFeeAmount = 0;
  let shippingCost = 0;
  let netAmount = listing.price;
  let realStatus = 'under_review';

  // 1. Fetch item details for real status
  try {
    const itemRes = await fetch(`${ML_API}/items/${mlData.id}`, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
    });
    if (itemRes.ok) {
      const itemInfo: any = await itemRes.json();
      if (itemInfo.status) realStatus = itemInfo.status;
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch item status after publish');
  }

  // 2. Fetch commission using listing_prices
  try {
    const categoryId = listing.category_id || product?.ml_category_id || 'MLB1000';
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${listingTypeId}&currency_id=BRL`;
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
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
    if (!saleFeeAmount && listing.price > 0) {
      const pct = listingTypeId === 'gold_pro' ? 0.165 : 0.13;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch commission after publish');
  }

  // 3. Fetch shipping cost from published item (real ML value)
  //    Uses /items/{id}/shipping_options which returns the REAL cost matching the seller panel
  const fetchItemShippingCost = async (itemId: string): Promise<number> => {
    const res = await fetch(`${ML_API}/items/${itemId}/shipping_options`, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
    });
    if (!res.ok) return 0;
    const data: any = await res.json();
    if (data?.coverage?.all_country?.list_cost) return data.coverage.all_country.list_cost;
    if (data?.options?.length > 0) {
      const rec = data.options.find((o: any) => o.recommended) || data.options[0];
      return rec?.list_cost || rec?.cost || 0;
    }
    return 0;
  };

  try {
    // 1st attempt: immediate
    shippingCost = await fetchItemShippingCost(mlData.id);

    // 2nd attempt: retry after 2s if first returned 0 (ML may need time to process)
    if (!shippingCost) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      shippingCost = await fetchItemShippingCost(mlData.id);
    }

    // Fallback: use /users/{id}/shipping_options/free with dimensions
    if (!shippingCost && product?.dimensions && product?.weight_kg) {
      const dims = product.dimensions as { height?: number; width?: number; length?: number };
      const h = dims.height || 10;
      const w = dims.width || 10;
      const len = dims.length || 10;
      const weightGrams = Math.round((product.weight_kg || 0.5) * 1000);
      const dimensionsStr = `${h}x${w}x${len},${weightGrams}`;

      const shippingParams = new URLSearchParams({
        dimensions: dimensionsStr,
        item_price: String(listing.price),
        listing_type_id: listingTypeId,
        mode: 'me2',
        condition: itemCondition || 'new',
        free_shipping: String(freeShipping),
        verbose: 'true',
        logistic_type: 'drop_off',
      });

      const fallbackRes = await fetch(
        `${ML_API}/users/${cred.ml_user_id}/shipping_options/free?${shippingParams.toString()}`,
        { headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' } }
      );
      if (fallbackRes.ok) {
        const fallbackData: any = await fallbackRes.json();
        shippingCost = fallbackData?.coverage?.all_country?.list_cost || 0;
      }
    }

    logger.info({ mlItemId: mlData.id, shippingCost, method: shippingCost ? 'items_api' : 'fallback' }, 'Shipping cost fetched after publish');
  } catch (err) {
    logger.warn({ err }, 'Could not fetch shipping cost after publish');
  }

  netAmount = listing.price - saleFeeAmount - shippingCost;

  const updatedAttrs = {
    ...(listing.attributes || {}),
    _ml_sale_fee: saleFeeAmount,
    _ml_shipping_cost: shippingCost,
    _ml_net_amount: netAmount,
  };

  // Extract thumbnail from publish response
  const publishThumbnail = mlData.thumbnail || mlData.pictures?.[0]?.secure_url || mlData.pictures?.[0]?.url || null;

  await query(
    `UPDATE ml_listings
     SET ml_item_id = $1, ml_credential_id = $2, status = $3, sync_status = 'synced',
         last_sync_at = NOW(), updated_at = NOW(), attributes = $4, ml_thumbnail = $5
     WHERE id = $6`,
    [mlData.id, cred.id, realStatus, JSON.stringify(updatedAttrs), publishThumbnail, listingId]
  );

  return reply.send({
    success: true,
    ml_item_id: mlData.id,
    permalink: mlData.permalink,
    status: realStatus,
    sale_fee: saleFeeAmount,
    shipping_cost: shippingCost,
    net_amount: netAmount,
  });
}

// ─── UPDATE ──────────────────────────────────────────────────────────
async function handleUpdate(cred: MlCredRow, listingId: string, newListingTypeId: string | undefined, reply: any) {
  const listing = await queryOne<any>(
    `SELECT * FROM ml_listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  if (!listing || !listing.ml_item_id) {
    return reply.status(400).send({ error: 'Anúncio não publicado no ML' });
  }

  const stockData = await queryOne<{ available: number }>(
    `SELECT available FROM available_stock WHERE product_id = $1 AND tenant_id = $2 LIMIT 1`,
    [listing.product_id, listing.tenant_id]
  );

  // Only send available_quantity if we have stock data. Never send 0 (deactivates listing).
  const updatePayload: Record<string, unknown> = {
    price: listing.price,
  };

  if (stockData && stockData.available > 0) {
    updatePayload.available_quantity = stockData.available;
  }
  // If no stock data, don't send available_quantity at all — ML keeps current value.

  const mlResponse = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  const mlData: any = await mlResponse.json();

  if (!mlResponse.ok) {
    logger.error({ listingId, mlError: mlData.message }, 'ML update error');
    await query(
      `UPDATE ml_listings SET sync_status = 'error', updated_at = NOW() WHERE id = $1`,
      [listingId]
    );
    return reply.status(400).send({ error: 'Erro ao atualizar no ML', ml_error: mlData.message });
  }

  // Fetch updated fees
  const listingTypeId = newListingTypeId || (listing.attributes as any)?._listing_type_id || 'gold_pro';
  let saleFeeAmount = 0;
  let shippingCost = 0;
  let netAmount = listing.price;

  try {
    const categoryId = listing.category_id || 'MLB1000';
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${listingTypeId}&currency_id=BRL`;
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
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
    if (!saleFeeAmount && listing.price > 0) {
      const pct = listingTypeId === 'gold_pro' ? 0.165 : 0.13;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch listing fees on update');
  }

  // Fetch shipping cost
  try {
    const product = await queryOne<{ dimensions: any; weight_kg: number }>(
      `SELECT dimensions, weight_kg FROM products WHERE id = $1 LIMIT 1`,
      [listing.product_id]
    );

    if (product) {
      const dims = product.dimensions as { height?: number; width?: number; length?: number } | null;
      const h = dims?.height || 10;
      const w = dims?.width || 10;
      const l = dims?.length || 10;
      const weightGrams = Math.round((product.weight_kg || 0.5) * 1000);
      const dimensionsStr = `${h}x${w}x${l},${weightGrams}`;
      const freeShippingFlag = (listing.attributes as any)?._free_shipping === true;

      const shippingParams = new URLSearchParams({
        dimensions: dimensionsStr,
        item_price: String(listing.price),
        listing_type_id: listingTypeId,
        mode: 'me2',
        condition: (listing.attributes as any)?._condition || 'new',
        free_shipping: String(freeShippingFlag),
        verbose: 'true',
      });

      const shippingUrl = `${ML_API}/users/${cred.ml_user_id}/shipping_options/free?${shippingParams.toString()}`;
      const shippingRes = await fetch(shippingUrl, {
        headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
      });
      if (shippingRes.ok) {
        const shippingData: any = await shippingRes.json();
        shippingCost = shippingData?.coverage?.all_country?.list_cost || 0;
        if (!shippingCost && shippingData?.options?.length > 0) {
          const maxOpt = shippingData.options.reduce(
            (m: any, o: any) => ((o.list_cost || 0) > (m.list_cost || 0) ? o : m),
            shippingData.options[0],
          );
          shippingCost = maxOpt?.list_cost || maxOpt?.cost || 0;
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch shipping cost on update');
  }

  netAmount = listing.price - saleFeeAmount - shippingCost;

  const updatedAttrs: Record<string, unknown> = {
    ...(listing.attributes || {}),
    _ml_sale_fee: saleFeeAmount,
    _ml_shipping_cost: shippingCost,
    _ml_net_amount: netAmount,
  };
  if (newListingTypeId) {
    updatedAttrs._listing_type_id = newListingTypeId;
  }

  await query(
    `UPDATE ml_listings SET sync_status = 'synced', last_sync_at = NOW(), updated_at = NOW(), attributes = $1 WHERE id = $2`,
    [JSON.stringify(updatedAttrs), listingId]
  );

  return reply.send({
    success: true,
    sale_fee: saleFeeAmount,
    shipping_cost: shippingCost,
    net_amount: netAmount,
  });
}

// ─── STATUS CHANGE (PAUSE / ACTIVATE) ───────────────────────────────
async function handleStatusChange(cred: MlCredRow, listingId: string, newStatus: string, reply: any) {
  const listing = await queryOne<{ ml_item_id: string | null }>(
    `SELECT ml_item_id FROM ml_listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  if (!listing || !listing.ml_item_id) {
    return reply.status(400).send({ error: 'Anúncio não publicado no ML' });
  }

  const mlResponse = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ status: newStatus }),
  });

  const mlData: any = await mlResponse.json();

  if (!mlResponse.ok) {
    logger.error({ listingId, mlError: mlData.message }, 'ML status change error');
    return reply.status(400).send({ error: 'Erro ao alterar status no ML', ml_error: mlData.message });
  }

  await query(
    `UPDATE ml_listings SET status = $1, sync_status = 'synced', last_sync_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [newStatus, listingId]
  );

  return reply.send({ success: true, status: newStatus });
}

// ─── CLOSE ───────────────────────────────────────────────────────────
async function handleClose(cred: MlCredRow, listingId: string, reply: any) {
  const listing = await queryOne<{ ml_item_id: string | null }>(
    `SELECT ml_item_id FROM ml_listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  if (!listing) {
    return reply.status(404).send({ error: 'Anúncio não encontrado' });
  }

  if (listing.ml_item_id) {
    const mlResponse = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cred.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ status: 'closed' }),
    });

    const mlData: any = await mlResponse.json();

    if (!mlResponse.ok) {
      logger.error({ listingId, mlError: mlData.message }, 'ML close error');
      return reply.status(400).send({ error: 'Erro ao encerrar no ML', ml_error: mlData.message });
    }
  }

  await query(`DELETE FROM ml_listings WHERE id = $1`, [listingId]);

  return reply.send({ success: true });
}

// ─── GET FEES ────────────────────────────────────────────────────────
async function handleGetFees(cred: MlCredRow, body: any, reply: any) {
  const { price, category_id, listing_type_id } = body;
  const ltId = listing_type_id || 'gold_pro';

  const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${price}&category_id=${category_id || 'MLB1000'}&listing_type_id=${ltId}&currency_id=BRL`;

  const feesRes = await fetch(feesUrl, {
    headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
  });

  if (!feesRes.ok) {
    const errData: any = await feesRes.json();
    return reply.status(400).send({ error: 'Erro ao consultar taxas', ml_error: errData.message });
  }

  const feesData: any = await feesRes.json();

  let saleFeeAmount = 0;
  let feeDetails = null;

  if (Array.isArray(feesData)) {
    const feeEntry = feesData.find((f: any) => f.listing_type_id === ltId) || feesData[0];
    if (feeEntry) {
      saleFeeAmount = feeEntry.sale_fee_amount || 0;
      feeDetails = feeEntry.sale_fee_details || null;
    }
  } else if (feesData?.sale_fee_amount) {
    saleFeeAmount = feesData.sale_fee_amount;
    feeDetails = feesData.sale_fee_details || null;
  }

  // Fallback
  if (!saleFeeAmount && price > 0) {
    const pct = ltId === 'gold_pro' ? 0.165 : 0.13;
    saleFeeAmount = Math.round(price * pct * 100) / 100;
  }

  return reply.send({ sale_fee_amount: saleFeeAmount, fee_details: feeDetails, fees: feesData });
}

// ─── REFRESH (Sync real data from ML) ────────────────────────────────
async function handleRefresh(cred: MlCredRow, listingId: string, reply: any) {
  const listing = await queryOne<any>(
    `SELECT * FROM ml_listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  if (!listing || !listing.ml_item_id) {
    return reply.status(400).send({ error: 'Anúncio não publicado no ML' });
  }

  // 1. Fetch item details (status, shipping info)
  const itemRes = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
    headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
  });
  if (!itemRes.ok) {
    const errData: any = await itemRes.json();
    return reply.status(400).send({ error: 'Erro ao consultar item no ML', ml_error: errData.message });
  }
  const itemData: any = await itemRes.json();
  const realStatus = itemData.status || listing.status;

  // 2. Fetch commission using listing_prices
  const ltId = itemData.listing_type_id || (listing.attributes as any)?._listing_type_id || 'gold_pro';

  // Extract ML thumbnail
  const mlThumbnail = itemData.thumbnail || itemData.pictures?.[0]?.secure_url || itemData.pictures?.[0]?.url || null;

  // 2. Get REAL price first (may be promotional) via /items/{id}/sale_price
  let mlPrice = itemData.price || listing.price;
  let hasPromotion = false;
  let originalPrice: number | null = null;
  try {
    const salePriceRes = await fetch(`${ML_API}/items/${listing.ml_item_id}/sale_price`, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
    });
    if (salePriceRes.ok) {
      const salePriceData: any = await salePriceRes.json();
      if (salePriceData.amount) mlPrice = salePriceData.amount;
      if (salePriceData.regular_amount && salePriceData.regular_amount > salePriceData.amount) {
        hasPromotion = true;
        originalPrice = salePriceData.regular_amount;
      }
    }
  } catch {
    if (itemData.original_price != null && itemData.original_price > mlPrice) {
      hasPromotion = true;
      originalPrice = itemData.original_price;
    } else if (itemData.deal_ids && itemData.deal_ids.length > 0) {
      hasPromotion = true;
    }
  }

  // 3. Calculate fees using the REAL selling price (promotional if applicable)
  let saleFeeAmount = 0;
  try {
    const categoryId = listing.category_id || 'MLB1000';
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${mlPrice}&category_id=${categoryId}&listing_type_id=${ltId}&currency_id=BRL`;
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
    });
    if (feesRes.ok) {
      const feesData: any = await feesRes.json();
      if (Array.isArray(feesData)) {
        const feeEntry = feesData.find((f: any) => f.listing_type_id === ltId) || feesData[0];
        if (feeEntry) saleFeeAmount = feeEntry.sale_fee_amount || 0;
      } else if (feesData?.sale_fee_amount) {
        saleFeeAmount = feesData.sale_fee_amount;
      }
    }
    if (!saleFeeAmount && mlPrice > 0) {
      const pct = ltId === 'gold_pro' ? 0.165 : 0.13;
      saleFeeAmount = Math.round(mlPrice * pct * 100) / 100;
    }
  } catch (err) {
    logger.warn({ err }, 'Refresh: could not fetch fees');
  }

  // 4. Get shipping cost — aligned with handlePublish logic
  let shippingCost = 0;
  const fetchShippingCost = async (): Promise<number> => {
    try {
      const res = await fetch(`${ML_API}/items/${listing.ml_item_id}/shipping_options`, {
        headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
      });
      if (!res.ok) return 0;
      const data: any = await res.json();
      if (data?.coverage?.all_country?.list_cost) return data.coverage.all_country.list_cost;
      if (data?.options?.length > 0) {
        const rec = data.options.find((o: any) => o.recommended) || data.options[0];
        return rec?.list_cost || rec?.cost || 0;
      }
      return 0;
    } catch { return 0; }
  };

  shippingCost = await fetchShippingCost();
  if (shippingCost === 0) {
    await new Promise(r => setTimeout(r, 2000));
    shippingCost = await fetchShippingCost();
  }

  // Fallback: /users/{id}/shipping_options/free with real price
  if (shippingCost === 0 && cred.ml_user_id) {
    try {
      const fallbackRes = await fetch(
        `${ML_API}/users/${cred.ml_user_id}/shipping_options/free?dimensions=10x10x10,500&item_price=${mlPrice}`,
        { headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' } }
      );
      if (fallbackRes.ok) {
        const fbData: any = await fallbackRes.json();
        if (fbData?.coverage?.all_country?.list_cost) {
          shippingCost = fbData.coverage.all_country.list_cost;
        }
      }
    } catch { /* non-blocking */ }
  }

  const netAmount = mlPrice - saleFeeAmount - shippingCost;

  const updatedAttrs = {
    ...(listing.attributes || {}),
    _ml_sale_fee: saleFeeAmount,
    _ml_shipping_cost: shippingCost,
    _ml_net_amount: netAmount,
    _listing_type_id: itemData.listing_type_id || (listing.attributes as any)?._listing_type_id,
    _has_promotion: hasPromotion,
    _ml_original_price: originalPrice,
  };

  await query(
    `UPDATE ml_listings SET status = $1, sync_status = 'synced', last_sync_at = NOW(), updated_at = NOW(),
     title = $2, price = $3, ml_thumbnail = $4, attributes = $5,
     original_price = $6, has_promotion = $7
     WHERE id = $8`,
    [realStatus, itemData.title || listing.title, mlPrice, mlThumbnail, JSON.stringify(updatedAttrs), originalPrice, hasPromotion, listingId]
  );

  return reply.send({
    success: true,
    status: realStatus,
    sale_fee: saleFeeAmount,
    shipping_cost: shippingCost,
    net_amount: netAmount,
    listing_type_id: itemData.listing_type_id,
  });
}

// ─── STOCK CHECK ─────────────────────────────────────────────────────
// ─── IMPORT ─────────────────────────────────────────────────────────
async function handleImport(cred: MlCredRow, tenantId: string, mlItemId: string, productId: string, reply: any) {
  if (!mlItemId || !productId) {
    return reply.status(400).send({ error: 'ml_item_id e product_id são obrigatórios' });
  }

  // Clean ML item ID (extract from URL if needed)
  const cleanId = mlItemId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Check for duplicates
  const existing = await queryOne(
    `SELECT id FROM ml_listings WHERE ml_item_id = $1 AND tenant_id = $2`,
    [cleanId, tenantId]
  );
  if (existing) {
    return reply.status(409).send({ error: 'Este anúncio já foi importado' });
  }

  // Verify product exists
  const product = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM products WHERE id = $1`,
    [productId]
  );
  if (!product) {
    return reply.status(404).send({ error: 'Produto não encontrado' });
  }

  // Fetch item from ML API
  const mlRes = await fetch(`${ML_API}/items/${cleanId}`, {
    headers: { Authorization: `Bearer ${cred.access_token}` },
  });

  if (!mlRes.ok) {
    const errData: any = await mlRes.json().catch(() => ({}));
    return reply.status(mlRes.status).send({
      error: 'Não foi possível buscar o anúncio no ML',
      ml_error: errData.message || errData.error || `HTTP ${mlRes.status}`,
    });
  }

  const mlData: any = await mlRes.json();

  // Extract data from ML item
  const title = mlData.title || product.name;
  const price = mlData.price || 0;
  const status = mlData.status === 'active' ? 'active' : mlData.status === 'paused' ? 'paused' : 'paused';
  const categoryId = mlData.category_id || null;
  const listingTypeId = mlData.listing_type_id || 'gold_special';
  const permalink = mlData.permalink || null;

  // Extract thumbnail from ML pictures
  const mlThumbnail = mlData.thumbnail || mlData.pictures?.[0]?.secure_url || mlData.pictures?.[0]?.url || null;

  // Detect promotions via /items/{id}/sale_price
  let actualPrice = price;
  let hasPromo = false;
  let origPrice: number | null = null;
  try {
    const spRes = await fetch(`${ML_API}/items/${cleanId}/sale_price`, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' },
    });
    if (spRes.ok) {
      const spData: any = await spRes.json();
      if (spData.amount) actualPrice = spData.amount;
      if (spData.regular_amount && spData.regular_amount > spData.amount) {
        hasPromo = true;
        origPrice = spData.regular_amount;
      }
    }
  } catch {
    if (mlData.original_price != null && mlData.original_price > price) {
      hasPromo = true;
      origPrice = mlData.original_price;
    }
  }

  const attributes: Record<string, unknown> = {
    _listing_type_id: listingTypeId,
    _imported: true,
    _import_date: new Date().toISOString(),
    _permalink: permalink,
    _condition: mlData.condition || 'new',
    _has_promotion: hasPromo,
    _ml_original_price: origPrice,
  };

  // Create listing in DB
  const listing = await queryOne<{ id: string }>(
    `INSERT INTO ml_listings (product_id, tenant_id, ml_item_id, ml_credential_id, title, price, status, category_id, sync_status, attributes, source, ml_thumbnail, original_price, has_promotion, last_sync_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'synced', $9, 'imported', $10, $11, $12, NOW())
     RETURNING id`,
    [productId, tenantId, cleanId, cred.id, title, actualPrice, status, categoryId, JSON.stringify(attributes), mlThumbnail, origPrice, hasPromo]
  );

  if (!listing) {
    return reply.status(500).send({ error: 'Erro ao criar listing importado' });
  }

  // Refresh to get real fees/shipping
  try {
    await handleRefresh(cred, listing.id, { status: () => ({ send: () => {} }) });
  } catch {
    // Non-blocking — listing was created, refresh is best-effort
  }

  logger.info({ tenantId, mlItemId: cleanId, listingId: listing.id, productId }, 'ML listing imported');

  return reply.send({
    success: true,
    id: listing.id,
    ml_item_id: cleanId,
    title,
    price,
    status,
    source: 'imported',
  });
}

async function handleStockCheck(productId: string | undefined, reply: any) {
  if (!productId) {
    return reply.status(400).send({ error: 'product_id é obrigatório' });
  }

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

  if (!listings || listings.length === 0) {
    return reply.send({ message: 'Sem anúncios ativos para este produto' });
  }

  const results: Array<{ id: string; action: string; reason?: string; error?: string }> = [];

  for (const listing of listings) {
    const stockData = await queryOne<{ available: number }>(
      `SELECT available FROM available_stock WHERE product_id = $1 AND tenant_id = $2 LIMIT 1`,
      [listing.product_id, listing.tenant_id]
    );

    const available = stockData?.available || 0;
    const minStock = Number((listing.attributes as any)?._min_stock || 0);

    if (available <= minStock && listing.status === 'active' && listing.ml_item_id) {
      const cred = await getCredForListing(listing.ml_credential_id, listing.tenant_id);
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
          results.push({ id: listing.id, action: 'paused', reason: 'stock_low' });
        } catch (err: any) {
          results.push({ id: listing.id, action: 'error', error: err.message });
        }
      }
    } else if (available > minStock && listing.status === 'paused' && listing.ml_item_id) {
      const cred = await getCredForListing(listing.ml_credential_id, listing.tenant_id);
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
          results.push({ id: listing.id, action: 'activated', reason: 'stock_available' });
        } catch (err: any) {
          results.push({ id: listing.id, action: 'error', error: err.message });
        }
      }
    } else {
      results.push({ id: listing.id, action: 'no_change' });
    }
  }

  return reply.send({ results });
}

async function getCredForListing(mlCredentialId: string | null, tenantId: string) {
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
