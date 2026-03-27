import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ML_API = "https://api.mercadolibre.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const { action, listing_id } = body;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === "stock_check") {
      return await handleStockCheck(adminClient, body.product_id);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const { data: profile } = await adminClient.from("profiles").select("tenant_id").eq("id", user.id).single();

    if (!profile?.tenant_id) {
      return jsonResponse({ error: "Perfil sem tenant" }, 400);
    }

    const tenantId = profile.tenant_id;

    // Resolve credential: if listing has ml_credential_id, use that; otherwise fallback to first credential
    let cred: any = null;

    if (listing_id && action !== "get_fees") {
      // Try to get credential from the listing itself
      const { data: listingData } = await adminClient
        .from("ml_listings")
        .select("ml_credential_id")
        .eq("id", listing_id)
        .single();

      if (listingData?.ml_credential_id) {
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("id", listingData.ml_credential_id)
          .single();
        cred = credData;
      }
    }

    // If no credential from listing, try body.ml_credential_id or fallback to first
    if (!cred) {
      if (body.ml_credential_id) {
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("id", body.ml_credential_id)
          .eq("tenant_id", tenantId)
          .single();
        cred = credData;
      } else {
        // Fallback: first credential for this tenant
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at")
          .limit(1)
          .single();
        cred = credData;
      }
    }

    if (!cred) {
      return jsonResponse({ error: "Mercado Livre não conectado" }, 400);
    }

    if (new Date(cred.expires_at) < new Date()) {
      return jsonResponse({ error: "Token ML expirado. Reconecte sua conta." }, 401);
    }

    switch (action) {
      case "publish":
        return await handlePublish(adminClient, cred, tenantId, listing_id);
      case "update":
        return await handleUpdate(adminClient, cred, listing_id, body.listing_type_id);
      case "pause":
        return await handleStatusChange(adminClient, cred, listing_id, "paused");
      case "activate":
        return await handleStatusChange(adminClient, cred, listing_id, "active");
      case "close":
        return await handleClose(adminClient, cred, listing_id);
      case "get_fees":
        return await handleGetFees(cred, body);
      case "refresh":
        return await handleRefresh(adminClient, cred, listing_id);
      default:
        return jsonResponse({ error: "Ação inválida" }, 400);
    }
  } catch (error) {
    console.error("ml-sync error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── PUBLISH ─────────────────────────────────────────────────────────
async function handlePublish(adminClient: any, cred: any, tenantId: string, listingId: string) {
  const { data: listing, error: listingError } = await adminClient
    .from("ml_listings")
    .select(
      "*, products:product_id(name, description, sell_price, images, brand, category, weight_kg, dimensions, sku, condition, gtin, warranty_type, warranty_time, ml_category_id, attributes)",
    )
    .eq("id", listingId)
    .eq("tenant_id", tenantId)
    .single();

  if (listingError || !listing) {
    return jsonResponse({ error: "Anúncio não encontrado" }, 404);
  }

  if (listing.ml_item_id) {
    return jsonResponse({ error: "Anúncio já publicado no ML", ml_item_id: listing.ml_item_id }, 400);
  }

  const product = listing.products;
  const listingAttrs = listing.attributes || {};

  const listingTypeId = listingAttrs._listing_type_id || "gold_pro";
  const itemCondition = listingAttrs._condition || product?.condition || "new";
  const warrantyType = listingAttrs._warranty_type || product?.warranty_type || "Garantia do vendedor";
  const warrantyTime = listingAttrs._warranty_time || product?.warranty_time || "90 dias";
  const sellerSku = listingAttrs._seller_sku || product?.sku;
  const freeShipping = listingAttrs._free_shipping === true;
  const productAttrs = product?.attributes as Record<string, unknown> | null;
  const availableQty = Number(productAttrs?._available_quantity || listingAttrs._available_quantity || 1);

  const conditionMap: Record<string, string> = {
    new: "2230284",
    used: "2230581",
    refurbished: "2230582",
  };

  const mlPayload: Record<string, unknown> = {
    title: listing.title,
    category_id: listing.category_id || product?.ml_category_id || "MLB1000",
    price: listing.price,
    currency_id: "BRL",
    available_quantity: Math.max(availableQty, 1),
    buying_mode: "buy_it_now",
    condition: itemCondition === "refurbished" ? "new" : itemCondition,
    listing_type_id: listingTypeId,
    channels: ["marketplace"],
    sale_terms: [
      { id: "WARRANTY_TYPE", value_name: warrantyType },
      { id: "WARRANTY_TIME", value_name: warrantyTime },
    ],
    pictures: (product?.images || []).map((url: string) => ({ source: url })),
  };

  const shippingObj: Record<string, unknown> = {
    mode: "me2",
    local_pick_up: false,
    free_shipping: freeShipping,
  };

  if (product?.dimensions && product?.weight_kg) {
    const dims = product.dimensions as { height?: number; width?: number; length?: number };
    const h = dims.height || 10;
    const w = dims.width || 10;
    const l = dims.length || 10;
    const weightGrams = Math.round((product.weight_kg || 0.5) * 1000);
    shippingObj.dimensions = `${h}x${w}x${l},${weightGrams}`;
  }
  mlPayload.shipping = shippingObj;

  const mlAttributes: Array<Record<string, string>> = [];

  if (conditionMap[itemCondition]) {
    mlAttributes.push({ id: "ITEM_CONDITION", value_id: conditionMap[itemCondition] });
  }

  if (sellerSku) {
    mlAttributes.push({ id: "SELLER_SKU", value_name: sellerSku });
  }

  if (listingAttrs && typeof listingAttrs === "object") {
    for (const [id, value] of Object.entries(listingAttrs)) {
      if (id.startsWith("_")) continue;
      const alreadyAdded = mlAttributes.some((a) => a.id === id);
      if (!alreadyAdded && value) {
        mlAttributes.push({ id, value_name: String(value) });
      }
    }
  }

  if (productAttrs && typeof productAttrs === "object") {
    for (const [id, value] of Object.entries(productAttrs)) {
      if (id.startsWith("_")) continue;
      const alreadyAdded = mlAttributes.some((a) => a.id === id);
      if (!alreadyAdded && value) {
        mlAttributes.push({ id, value_name: String(value) });
      }
    }
  }

  if (mlAttributes.length > 0) {
    mlPayload.attributes = mlAttributes;
  }

  console.log("Publishing to ML:", JSON.stringify(mlPayload));

  const mlResponse = await fetch(`${ML_API}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(mlPayload),
  });

  const mlData = await mlResponse.json();

  if (!mlResponse.ok) {
    console.error("ML publish error:", mlData);

    const causes = mlData.cause || [];
    const missingAttrs = causes
      .filter((c: any) => c.code === "item.attributes.missing_required")
      .map((c: any) => c.message)
      .join("; ");

    const errorMsg = missingAttrs
      ? `Atributos obrigatórios faltando: ${missingAttrs}`
      : mlData.message || "Erro desconhecido";

    await adminClient
      .from("ml_listings")
      .update({
        sync_status: "error",
        attributes: {
          ...(listing.attributes || {}),
          _last_error: errorMsg,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    return jsonResponse(
      {
        error: "Erro ao publicar no Mercado Livre",
        ml_error: errorMsg,
        ml_details: causes,
      },
      400,
    );
  }

  const productDescription = product?.description;
  if (productDescription && mlData.id) {
    try {
      const descRes = await fetch(`${ML_API}/items/${mlData.id}/description`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cred.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ plain_text: productDescription }),
      });
      if (!descRes.ok) {
        const descErr = await descRes.json();
        console.warn("ML description POST failed, trying PUT:", descErr);
        const descPutRes = await fetch(`${ML_API}/items/${mlData.id}/description`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${cred.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ plain_text: productDescription }),
        });
        if (!descPutRes.ok) {
          const descPutErr = await descPutRes.json();
          console.error("ML description PUT also failed:", descPutErr);
        }
      }
    } catch (err) {
      console.error("Error sending description to ML:", err);
    }
  }

  // Fetch real data from the published item: status, fees, shipping
  let saleFeeAmount = 0;
  let shippingCost = 0;
  let netAmount = listing.price;
  let realStatus = "under_review";

  // 1. Fetch item details for real status
  try {
    const itemRes = await fetch(`${ML_API}/items/${mlData.id}`, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
    });
    if (itemRes.ok) {
      const itemInfo = await itemRes.json();
      if (itemInfo.status) realStatus = itemInfo.status;
      console.log("Published item status:", realStatus);
    }
  } catch (err) {
    console.warn("Could not fetch item status:", err);
  }

  // 2. Fetch commission using listing_prices (works always, even under_review)
  try {
    const categoryId = listing.category_id || product?.ml_category_id || "MLB1000";
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${listingTypeId}&currency_id=BRL&logistic_type=cross_docking&shipping_mode=me2`;
    console.log("Fetching listing_prices:", feesUrl);
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
    });
    if (feesRes.ok) {
      const feesData = await feesRes.json();
      console.log("listing_prices response:", JSON.stringify(feesData));
      if (Array.isArray(feesData)) {
        const feeEntry = feesData.find((f: any) => f.listing_type_id === listingTypeId) || feesData[0];
        if (feeEntry) {
          saleFeeAmount = feeEntry.sale_fee_amount || 0;
        }
      } else if (feesData?.sale_fee_amount) {
        saleFeeAmount = feesData.sale_fee_amount;
      }
    } else {
      console.warn("listing_prices error:", await feesRes.text());
    }
    // Fallback: calculate from known percentages if API returned 0
    if (!saleFeeAmount && listing.price > 0) {
      const pct = listingTypeId === "gold_pro" ? 0.17 : 0.12;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
      console.log("Using fallback commission:", saleFeeAmount);
    }
    console.log("Commission extracted:", saleFeeAmount);
  } catch (err) {
    console.warn("Could not fetch commission:", err);
  }

  // 3. Fetch shipping cost - try item-specific shipping first, then user-level fallback
  try {
    // Try item-specific shipping (most accurate after publish)
    const shippingUrl = `${ML_API}/items/${mlData.id}/shipping_options?zip_code=01310100`;
    console.log("Fetching item shipping options:", shippingUrl);
    const shippingRes = await fetch(shippingUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
    });
    if (shippingRes.ok) {
      const shippingData = await shippingRes.json();
      console.log("ML item shipping response:", JSON.stringify(shippingData));
      // Extract from options array
      if (shippingData?.options?.length > 0) {
        const recommended = shippingData.options.find((o: any) => o.recommended) || shippingData.options[0];
        shippingCost = recommended?.list_cost || recommended?.cost || 0;
      }
      // Try coverage path
      if (!shippingCost && shippingData?.coverage?.all_country?.list_cost) {
        shippingCost = shippingData.coverage.all_country.list_cost;
      }
    }

    // Fallback to user-level shipping estimate if item-level didn't work
    if (!shippingCost) {
      const dims = product?.dimensions as { height?: number; width?: number; length?: number } | null;
      const height = dims?.height || 10;
      const width = dims?.width || 10;
      const length = dims?.length || 10;
      const weightGrams = Math.round((product?.weight_kg || 0.5) * 1000);
      const dimensionsStr = `${height}x${width}x${length},${weightGrams}`;

      const shippingParams = new URLSearchParams({
        dimensions: dimensionsStr,
        item_price: String(listing.price),
        listing_type_id: listingTypeId,
        mode: "me2",
        condition: itemCondition || "new",
        free_shipping: String(freeShipping),
        verbose: "true",
      });

      const fallbackUrl = `${ML_API}/users/${cred.ml_user_id}/shipping_options/free?${shippingParams.toString()}`;
      console.log("Fetching user-level shipping:", fallbackUrl);
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        console.log("User-level shipping response:", JSON.stringify(fallbackData));
        shippingCost = fallbackData?.coverage?.all_country?.list_cost || 0;
        if (!shippingCost && fallbackData?.options?.length > 0) {
          const maxOpt = fallbackData.options.reduce(
            (m: any, o: any) => ((o.list_cost || 0) > (m.list_cost || 0) ? o : m),
            fallbackData.options[0],
          );
          shippingCost = maxOpt?.list_cost || maxOpt?.cost || 0;
        }
      }
    }
    console.log("Shipping cost extracted:", shippingCost);
  } catch (err) {
    console.warn("Could not fetch shipping cost:", err);
  }

  netAmount = listing.price - saleFeeAmount - shippingCost;

  await adminClient
    .from("ml_listings")
    .update({
      ml_item_id: mlData.id,
      ml_credential_id: cred.id,
      status: realStatus,
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attributes: {
        ...(listing.attributes || {}),
        _ml_sale_fee: saleFeeAmount,
        _ml_shipping_cost: shippingCost,
        _ml_net_amount: netAmount,
      },
    })
    .eq("id", listingId);

  return jsonResponse({
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
async function handleUpdate(adminClient: any, cred: any, listingId: string, newListingTypeId?: string) {
  const { data: listing, error } = await adminClient.from("ml_listings").select("*").eq("id", listingId).single();

  if (error || !listing || !listing.ml_item_id) {
    return jsonResponse({ error: "Anúncio não publicado no ML" }, 400);
  }

  const { data: stockData } = await adminClient
    .from("available_stock")
    .select("available")
    .eq("product_id", listing.product_id)
    .eq("tenant_id", listing.tenant_id)
    .single();

  const updatePayload: Record<string, unknown> = {
    price: listing.price,
    available_quantity: stockData ? Math.max(stockData.available, 0) : 0,
  };

  const mlResponse = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(updatePayload),
  });

  const mlData = await mlResponse.json();

  if (!mlResponse.ok) {
    console.error("ML update error:", mlData);
    await adminClient
      .from("ml_listings")
      .update({ sync_status: "error", updated_at: new Date().toISOString() })
      .eq("id", listingId);

    return jsonResponse({ error: "Erro ao atualizar no ML", ml_error: mlData.message }, 400);
  }

  // Fetch updated fees using listing_prices (reliable, works always)
  const listingTypeId = newListingTypeId || (listing.attributes as any)?._listing_type_id || "gold_pro";
  let saleFeeAmount = 0;
  let shippingCost = 0;
  let netAmount = listing.price;
  try {
    const categoryId = listing.category_id || "MLB1000";
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${listingTypeId}&currency_id=BRL&logistic_type=cross_docking&shipping_mode=me2`;
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
    });
    if (feesRes.ok) {
      const feesData = await feesRes.json();
      if (Array.isArray(feesData)) {
        const feeEntry = feesData.find((f: any) => f.listing_type_id === listingTypeId) || feesData[0];
        if (feeEntry) saleFeeAmount = feeEntry.sale_fee_amount || 0;
      } else if (feesData?.sale_fee_amount) {
        saleFeeAmount = feesData.sale_fee_amount;
      }
    }
    if (!saleFeeAmount && listing.price > 0) {
      const pct = listingTypeId === "gold_pro" ? 0.17 : 0.12;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
    }
  } catch (err) {
    console.warn("Could not fetch listing fees on update:", err);
  }

  // Fetch shipping cost - get product dimensions
  try {
    const { data: product } = await adminClient
      .from("products")
      .select("dimensions, weight_kg")
      .eq("id", listing.product_id)
      .single();

    if (product) {
      const dims = product.dimensions as { height?: number; width?: number; length?: number } | null;
      const h = dims?.height || 10;
      const w = dims?.width || 10;
      const l = dims?.length || 10;
      const weightGrams = Math.round((product.weight_kg || 0.5) * 1000);
      const dimensionsStr = `${h}x${w}x${l},${weightGrams}`;
      const freeShipping = (listing.attributes as any)?._free_shipping === true;

      const shippingParams = new URLSearchParams({
        dimensions: dimensionsStr,
        item_price: String(listing.price),
        listing_type_id: listingTypeId,
        mode: "me2",
        condition: (listing.attributes as any)?._condition || "new",
        free_shipping: String(freeShipping),
        verbose: "true",
      });

      const shippingUrl = `${ML_API}/users/${cred.ml_user_id}/shipping_options/free?${shippingParams.toString()}`;
      const shippingRes = await fetch(shippingUrl, {
        headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
      });
      if (shippingRes.ok) {
        const shippingData = await shippingRes.json();
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
    console.warn("Could not fetch shipping cost on update:", err);
  }

  netAmount = listing.price - saleFeeAmount - shippingCost;

  const updatedAttrs = {
    ...(listing.attributes || {}),
    _ml_sale_fee: saleFeeAmount,
    _ml_shipping_cost: shippingCost,
    _ml_net_amount: netAmount,
  };
  if (newListingTypeId) {
    updatedAttrs._listing_type_id = newListingTypeId;
  }

  await adminClient
    .from("ml_listings")
    .update({
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attributes: updatedAttrs,
    })
    .eq("id", listingId);

  return jsonResponse({
    success: true,
    sale_fee: saleFeeAmount,
    shipping_cost: shippingCost,
    net_amount: netAmount,
  });
}

// ─── STATUS CHANGE (PAUSE / ACTIVATE) ───────────────────────────────
async function handleStatusChange(adminClient: any, cred: any, listingId: string, newStatus: string) {
  const { data: listing, error } = await adminClient.from("ml_listings").select("*").eq("id", listingId).single();

  if (error || !listing || !listing.ml_item_id) {
    return jsonResponse({ error: "Anúncio não publicado no ML" }, 400);
  }

  const mlResponse = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ status: newStatus }),
  });

  const mlData = await mlResponse.json();

  if (!mlResponse.ok) {
    console.error("ML status change error:", mlData);
    return jsonResponse({ error: "Erro ao alterar status no ML", ml_error: mlData.message }, 400);
  }

  await adminClient
    .from("ml_listings")
    .update({
      status: newStatus,
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  return jsonResponse({ success: true, status: newStatus });
}

// ─── CLOSE ───────────────────────────────────────────────────────────
async function handleClose(adminClient: any, cred: any, listingId: string) {
  const { data: listing, error } = await adminClient.from("ml_listings").select("*").eq("id", listingId).single();

  if (error || !listing) {
    return jsonResponse({ error: "Anúncio não encontrado" }, 404);
  }

  if (listing.ml_item_id) {
    const mlResponse = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cred.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status: "closed" }),
    });

    const mlData = await mlResponse.json();

    if (!mlResponse.ok) {
      console.error("ML close error:", mlData);
      return jsonResponse({ error: "Erro ao encerrar no ML", ml_error: mlData.message }, 400);
    }
  }

  await adminClient.from("ml_listings").delete().eq("id", listingId);

  return jsonResponse({ success: true });
}

// ─── GET FEES ────────────────────────────────────────────────────────
async function handleGetFees(cred: any, body: any) {
  const { price, category_id, listing_type_id } = body;
  const ltId = listing_type_id || "gold_pro";

  const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${price}&category_id=${category_id || "MLB1000"}&listing_type_id=${ltId}&currency_id=BRL&logistic_type=cross_docking&shipping_mode=me2`;
  console.log("get_fees URL:", feesUrl);

  const feesRes = await fetch(feesUrl, {
    headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
  });

  if (!feesRes.ok) {
    const errData = await feesRes.json();
    console.error("get_fees error:", errData);
    return jsonResponse({ error: "Erro ao consultar taxas", ml_error: errData.message }, 400);
  }

  const feesData = await feesRes.json();
  console.log("get_fees response:", JSON.stringify(feesData));

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

  // Fallback: calculate from known percentages
  if (!saleFeeAmount && price > 0) {
    const pct = ltId === "gold_pro" ? 0.17 : 0.12;
    saleFeeAmount = Math.round(price * pct * 100) / 100;
  }

  return jsonResponse({ sale_fee_amount: saleFeeAmount, fee_details: feeDetails, fees: feesData });
}

// ─── REFRESH (Sync real data from ML) ────────────────────────────────
async function handleRefresh(adminClient: any, cred: any, listingId: string) {
  const { data: listing, error } = await adminClient.from("ml_listings").select("*").eq("id", listingId).single();

  if (error || !listing || !listing.ml_item_id) {
    return jsonResponse({ error: "Anúncio não publicado no ML" }, 400);
  }

  // 1. Fetch item details (status, shipping info)
  let realStatus = listing.status;
  const itemRes = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
    headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
  });
  if (!itemRes.ok) {
    const errData = await itemRes.json();
    return jsonResponse({ error: "Erro ao consultar item no ML", ml_error: errData.message }, 400);
  }
  const itemData = await itemRes.json();
  realStatus = itemData.status || listing.status;
  console.log("Refresh - item status:", realStatus, "listing_type:", itemData.listing_type_id);

  // 2. Fetch commission using listing_prices (primary, always works)
  const ltId = itemData.listing_type_id || (listing.attributes as any)?._listing_type_id || "gold_pro";
  let saleFeeAmount = 0;
  try {
    const categoryId = listing.category_id || "MLB1000";
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${ltId}&currency_id=BRL&logistic_type=cross_docking&shipping_mode=me2`;
    console.log("Refresh - fetching listing_prices:", feesUrl);
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
    });
    if (feesRes.ok) {
      const feesData = await feesRes.json();
      console.log("Refresh - listing_prices response:", JSON.stringify(feesData));
      if (Array.isArray(feesData)) {
        const feeEntry = feesData.find((f: any) => f.listing_type_id === ltId) || feesData[0];
        if (feeEntry) saleFeeAmount = feeEntry.sale_fee_amount || 0;
      } else if (feesData?.sale_fee_amount) {
        saleFeeAmount = feesData.sale_fee_amount;
      }
    }
    if (!saleFeeAmount && listing.price > 0) {
      const pct = ltId === "gold_pro" ? 0.17 : 0.12;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
    }
  } catch (err) {
    console.warn("Refresh - could not fetch fees:", err);
  }

  // 3. Get shipping cost from item shipping options
  let shippingCost = 0;
  try {
    const shippingRes = await fetch(`${ML_API}/items/${listing.ml_item_id}/shipping_options?zip_code=01310100`, {
      headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
    });
    if (shippingRes.ok) {
      const shippingData = await shippingRes.json();
      console.log("Refresh - shipping data:", JSON.stringify(shippingData));
      if (shippingData?.options?.length > 0) {
        const recommended = shippingData.options.find((o: any) => o.recommended) || shippingData.options[0];
        shippingCost = recommended?.list_cost || recommended?.cost || 0;
      }
      if (!shippingCost && shippingData?.coverage?.all_country?.list_cost) {
        shippingCost = shippingData.coverage.all_country.list_cost;
      }
    }
  } catch (err) {
    console.warn("Refresh - could not fetch shipping:", err);
  }

  const netAmount = listing.price - saleFeeAmount - shippingCost;

  // Update listing with real data
  await adminClient
    .from("ml_listings")
    .update({
      status: realStatus,
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attributes: {
        ...(listing.attributes || {}),
        _ml_sale_fee: saleFeeAmount,
        _ml_shipping_cost: shippingCost,
        _ml_net_amount: netAmount,
        _listing_type_id: itemData.listing_type_id || (listing.attributes as any)?._listing_type_id,
      },
    })
    .eq("id", listingId);

  return jsonResponse({
    success: true,
    status: realStatus,
    sale_fee: saleFeeAmount,
    shipping_cost: shippingCost,
    net_amount: netAmount,
    listing_type_id: itemData.listing_type_id,
  });
}

// ─── STOCK CHECK ─────────────────────────────────────────────────────
async function handleStockCheck(adminClient: any, productId: string) {
  if (!productId) {
    return jsonResponse({ error: "product_id é obrigatório" }, 400);
  }

  const { data: listings } = await adminClient
    .from("ml_listings")
    .select("id, ml_item_id, product_id, tenant_id, status, attributes")
    .eq("product_id", productId)
    .in("status", ["active", "paused"]);

  if (!listings || listings.length === 0) {
    return jsonResponse({ message: "Sem anúncios ativos para este produto" });
  }

  const results = [];

  for (const listing of listings) {
    const { data: stockData } = await adminClient
      .from("available_stock")
      .select("available")
      .eq("product_id", listing.product_id)
      .eq("tenant_id", listing.tenant_id)
      .single();

    const available = stockData?.available || 0;
    const attrs = listing.attributes as Record<string, unknown> | null;
    const minStock = Number(attrs?._min_stock || 0);

    if (available <= minStock && listing.status === "active" && listing.ml_item_id) {
      // Get credential: prefer listing's ml_credential_id, fallback to tenant
      let cred: any = null;
      if (listing.ml_credential_id) {
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("id", listing.ml_credential_id)
          .single();
        cred = credData;
      }
      if (!cred) {
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("tenant_id", listing.tenant_id)
          .order("created_at")
          .limit(1)
          .single();
        cred = credData;
      }

      if (cred) {
        try {
          await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${cred.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "paused" }),
          });

          await adminClient
            .from("ml_listings")
            .update({ status: "paused", updated_at: new Date().toISOString() })
            .eq("id", listing.id);

          results.push({ id: listing.id, action: "paused", reason: "stock_low" });
        } catch (err) {
          results.push({ id: listing.id, action: "error", error: err.message });
        }
      }
    } else if (available > minStock && listing.status === "paused" && listing.ml_item_id) {
      let cred: any = null;
      if (listing.ml_credential_id) {
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("id", listing.ml_credential_id)
          .single();
        cred = credData;
      }
      if (!cred) {
        const { data: credData } = await adminClient
          .from("ml_credentials")
          .select("*")
          .eq("tenant_id", listing.tenant_id)
          .order("created_at")
          .limit(1)
          .single();
        cred = credData;
      }

      if (cred) {
        try {
          await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${cred.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "active" }),
          });

          await adminClient
            .from("ml_listings")
            .update({ status: "active", updated_at: new Date().toISOString() })
            .eq("id", listing.id);

          results.push({ id: listing.id, action: "activated", reason: "stock_available" });
        } catch (err) {
          results.push({ id: listing.id, action: "error", error: err.message });
        }
      }
    } else {
      results.push({ id: listing.id, action: "no_change" });
    }
  }

  return jsonResponse({ results });
}
