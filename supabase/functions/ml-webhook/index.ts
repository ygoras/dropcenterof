import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ML_API = "https://api.mercadolibre.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const { topic, resource, user_id: mlUserId } = body;

    console.log(`ML Webhook received: topic=${topic}, resource=${resource}, ml_user_id=${mlUserId}`);

    // Find the tenant associated with this ML user
    const { data: credential, error: credError } = await adminClient
      .from("ml_credentials")
      .select("id, tenant_id, access_token, expires_at, ml_user_id")
      .eq("ml_user_id", String(mlUserId))
      .single();

    if (credError || !credential) {
      console.error("Credential not found for ML user:", mlUserId);
      return new Response(JSON.stringify({ status: "ignored", reason: "credential_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check token validity
    if (new Date(credential.expires_at) < new Date()) {
      console.warn("Token expired for tenant:", credential.tenant_id);
      return new Response(JSON.stringify({ status: "ignored", reason: "token_expired" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle different topics
    switch (topic) {
      case "items":
        await handleItemNotification(adminClient, credential, resource);
        break;

      case "orders_v2":
      case "orders":
        await handleOrderNotification(adminClient, credential, resource);
        break;

      case "shipments":
        await handleShipmentNotification(adminClient, credential, resource);
        break;

      case "questions":
        console.log(`Question notification for tenant ${credential.tenant_id}: ${resource}`);
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    return new Response(JSON.stringify({ status: "received" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({ status: "error", message: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── HANDLE ITEM NOTIFICATION ────────────────────────────────────────
async function handleItemNotification(
  adminClient: any,
  credential: { id: string; tenant_id: string; access_token: string },
  resource: string,
) {
  // resource format: "/items/MLB12345678"
  const mlItemId = resource?.replace("/items/", "");
  if (!mlItemId) {
    console.warn("No item ID in resource:", resource);
    return;
  }

  console.log(`Processing item notification: ${mlItemId} for tenant ${credential.tenant_id}`);

  // Find matching listing in our DB
  const { data: listing, error: listingError } = await adminClient
    .from("ml_listings")
    .select("*")
    .eq("ml_item_id", mlItemId)
    .eq("tenant_id", credential.tenant_id)
    .single();

  if (listingError || !listing) {
    console.log(`No local listing found for ML item ${mlItemId}, skipping`);
    return;
  }

  // 1. Fetch real item data from ML
  const itemRes = await fetch(`${ML_API}/items/${mlItemId}`, {
    headers: { Authorization: `Bearer ${credential.access_token}`, Accept: "application/json" },
  });

  if (!itemRes.ok) {
    console.error(`Failed to fetch item ${mlItemId}:`, await itemRes.text());
    return;
  }

  const itemData = await itemRes.json();
  const newStatus = itemData.status;
  const listingTypeId = itemData.listing_type_id || (listing.attributes as any)?._listing_type_id || "gold_pro";

  console.log(`Item ${mlItemId}: status=${newStatus}, listing_type=${listingTypeId}`);

  // 2. Fetch commission using listing_prices (primary, always reliable)
  let saleFeeAmount = 0;
  try {
    const categoryId = listing.category_id || "MLB1000";
    const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${listing.price}&category_id=${categoryId}&listing_type_id=${listingTypeId}&currency_id=BRL&logistic_type=cross_docking&shipping_mode=me2`;
    console.log("Webhook - fetching listing_prices:", feesUrl);
    const feesRes = await fetch(feesUrl, {
      headers: { Authorization: `Bearer ${credential.access_token}`, Accept: "application/json" },
    });
    if (feesRes.ok) {
      const feesData = await feesRes.json();
      console.log("Webhook - listing_prices response:", JSON.stringify(feesData));
      if (Array.isArray(feesData)) {
        const feeEntry = feesData.find((f: any) => f.listing_type_id === listingTypeId) || feesData[0];
        if (feeEntry) saleFeeAmount = feeEntry.sale_fee_amount || 0;
      } else if (feesData?.sale_fee_amount) {
        saleFeeAmount = feesData.sale_fee_amount;
      }
    }
    // Fallback commission
    if (!saleFeeAmount && listing.price > 0) {
      const pct = listingTypeId === "gold_pro" ? 0.17 : 0.12;
      saleFeeAmount = Math.round(listing.price * pct * 100) / 100;
      console.log("Webhook - using fallback commission:", saleFeeAmount);
    }
  } catch (err) {
    console.warn("Webhook - could not fetch fees:", err);
  }

  // 3. Fetch shipping cost from item-specific endpoint
  let shippingCost = 0;
  try {
    const shippingRes = await fetch(`${ML_API}/items/${mlItemId}/shipping_options?zip_code=01310100`, {
      headers: { Authorization: `Bearer ${credential.access_token}`, Accept: "application/json" },
    });
    if (shippingRes.ok) {
      const shippingData = await shippingRes.json();
      console.log("Webhook - shipping data:", JSON.stringify(shippingData));
      if (shippingData?.options?.length > 0) {
        const recommended = shippingData.options.find((o: any) => o.recommended) || shippingData.options[0];
        shippingCost = recommended?.list_cost || recommended?.cost || 0;
      }
      if (!shippingCost && shippingData?.coverage?.all_country?.list_cost) {
        shippingCost = shippingData.coverage.all_country.list_cost;
      }
    }
  } catch (err) {
    console.warn("Webhook - could not fetch shipping:", err);
  }

  const netAmount = listing.price - saleFeeAmount - shippingCost;

  // 4. Update listing with real data
  await adminClient
    .from("ml_listings")
    .update({
      status: newStatus,
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attributes: {
        ...(listing.attributes || {}),
        _ml_sale_fee: saleFeeAmount,
        _ml_shipping_cost: shippingCost,
        _ml_net_amount: netAmount,
        _listing_type_id: listingTypeId,
      },
    })
    .eq("id", listing.id);

  console.log(`Updated listing ${listing.id}: status=${newStatus}, fee=${saleFeeAmount}, shipping=${shippingCost}, net=${netAmount}`);
}

// ─── HANDLE ORDER NOTIFICATION (orders_v2) ───────────────────────────
async function handleOrderNotification(
  adminClient: any,
  credential: { id: string; tenant_id: string; access_token: string; ml_user_id: string },
  resource: string,
) {
  // resource format: "/orders/2000003508419013"
  const mlOrderId = resource?.replace("/orders/", "");
  if (!mlOrderId) {
    console.warn("No order ID in resource:", resource);
    return;
  }

  console.log(`Processing order notification: ${mlOrderId} for tenant ${credential.tenant_id}`);

  // 1. Fetch order details from ML API
  const orderRes = await fetch(`${ML_API}/orders/${mlOrderId}`, {
    headers: {
      Authorization: `Bearer ${credential.access_token}`,
      Accept: "application/json",
      "x-format-new": "true",
    },
  });

  if (!orderRes.ok) {
    console.error(`Failed to fetch order ${mlOrderId}:`, await orderRes.text());
    return;
  }

  const orderData = await orderRes.json();
  console.log(`Order ${mlOrderId}: status=${orderData.status}, items=${orderData.order_items?.length}`);

  // Map ML order status to our internal status (credit check happens later)
  const statusMap: Record<string, string> = {
    confirmed: "approved",
    payment_required: "pending",
    payment_in_process: "pending",
    partially_paid: "pending",
    paid: "approved",
    partially_refunded: "approved",
    pending_cancel: "cancelled",
    cancelled: "cancelled",
  };

  let mappedStatus = statusMap[orderData.status] || orderData.status;

  // 2. Extract buyer info
  const buyer = orderData.buyer || {};
  const customerName = `${buyer.first_name || ""} ${buyer.last_name || ""}`.trim() || "Comprador ML";
  const customerEmail = buyer.email || null;
  const customerPhone = buyer.phone?.number
    ? `${buyer.phone.area_code || ""}${buyer.phone.number}`
    : null;
  const customerDocument = buyer.billing_info?.doc_number || null;

  // 3. Build order items from ML order_items
  const orderItems = (orderData.order_items || []).map((item: any) => {
    return {
      product_id: "", // Will try to match below
      product_name: item.item?.title || "Produto ML",
      sku: item.item?.seller_sku || item.item?.id || "",
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      ml_item_id: item.item?.id || null,
    };
  });

  // Try to match ML items to our products via ml_listings
  for (const orderItem of orderItems) {
    if (orderItem.ml_item_id) {
      const { data: listing } = await adminClient
        .from("ml_listings")
        .select("product_id")
        .eq("ml_item_id", orderItem.ml_item_id)
        .eq("tenant_id", credential.tenant_id)
        .single();

      if (listing) {
        orderItem.product_id = listing.product_id;

        // Get real SKU from product
        const { data: product } = await adminClient
          .from("products")
          .select("sku")
          .eq("id", listing.product_id)
          .single();

        if (product?.sku) {
          orderItem.sku = product.sku;
        }
      }
    }
  }

  // 4. Calculate totals
  const subtotal = orderItems.reduce(
    (sum: number, item: any) => sum + item.quantity * item.unit_price,
    0,
  );

  // Fetch shipping info
  let shippingCost = 0;
  let shippingAddress: Record<string, string> | null = null;
  let trackingCode: string | null = null;

  if (orderData.shipping?.id) {
    try {
      const shipRes = await fetch(`${ML_API}/shipments/${orderData.shipping.id}`, {
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          Accept: "application/json",
          "x-format-new": "true",
        },
      });
      if (shipRes.ok) {
        const shipData = await shipRes.json();
        console.log(`Shipment ${orderData.shipping.id}: status=${shipData.status}`);

        shippingCost = shipData.shipping_option?.cost || shipData.cost || 0;
        trackingCode = shipData.tracking_number || null;

        const receiver = shipData.receiver_address || {};
        if (receiver.street_name) {
          shippingAddress = {
            street: `${receiver.street_name} ${receiver.street_number || ""}`.trim(),
            city: receiver.city?.name || "",
            state: receiver.state?.name || "",
            zip: receiver.zip_code || "",
          };
        }

        // Update order status based on shipment status
        if (shipData.status === "shipped") {
          if (mappedStatus !== "cancelled") {
            orderPayload.status = "shipped";
            if (shipData.tracking_number) {
              orderPayload.tracking_code = shipData.tracking_number;
            }
          }
        } else if (shipData.status === "delivered") {
          if (mappedStatus !== "cancelled") {
            orderPayload.status = "delivered";
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch shipment details:", err);
    }
  }

  const total = orderData.total_amount || subtotal + shippingCost;

  // 5. Generate order number
  const orderNumber = `ML-${mlOrderId}`;

  // 6. Upsert order (insert or update if already exists)
  const { data: existingOrder } = await adminClient
    .from("orders")
    .select("id, status")
    .eq("ml_order_id", String(mlOrderId))
    .eq("tenant_id", credential.tenant_id)
    .single();

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
    total,
    shipping_address: shippingAddress,
    tracking_code: trackingCode,
    ml_order_id: String(mlOrderId),
    ml_credential_id: credential.id,
    notes: `Pedido originado do Mercado Livre. Pack ID: ${orderData.pack_id || "N/A"}`,
    updated_at: new Date().toISOString(),
  };

  if (existingOrder) {
    // Update existing order - don't regress status
    const statusPriority: Record<string, number> = {
      pending: 0,
      pending_credit: 1,
      approved: 2,
      invoiced: 3,
      picking: 4,
      packing: 5,
      packed: 6,
      shipped: 7,
      delivered: 8,
      cancelled: 9,
    };

    const currentPriority = statusPriority[existingOrder.status] ?? 0;
    const newPriority = statusPriority[mappedStatus] ?? 0;

    // Only advance status, never regress (except to cancelled)
    const finalStatus =
      mappedStatus === "cancelled" || newPriority >= currentPriority
        ? mappedStatus
        : existingOrder.status;

    await adminClient
      .from("orders")
      .update({ ...orderPayload, status: finalStatus })
      .eq("id", existingOrder.id);

    console.log(`Updated order ${existingOrder.id}: status=${finalStatus}`);
  } else {
    // Insert new order
    const { error: insertError } = await adminClient
      .from("orders")
      .insert({ ...orderPayload, created_at: orderData.date_created || new Date().toISOString() });

    if (insertError) {
      console.error("Failed to insert order:", insertError);
      return;
    }

    console.log(`Created new order: ${orderNumber} for tenant ${credential.tenant_id}`);
  }

  // 7. CREDIT CHECK: For approved orders, verify seller has enough credit
  if (mappedStatus === "approved" && !existingOrder) {
    // Calculate total cost_price of the order items
    let totalCostPrice = 0;
    for (const item of orderItems) {
      if (!item.product_id) continue;
      const { data: product } = await adminClient
        .from("products")
        .select("cost_price")
        .eq("id", item.product_id)
        .single();
      if (product) {
        totalCostPrice += (product.cost_price || 0) * (item.quantity || 1);
      }
    }

    if (totalCostPrice > 0) {
      // Try to debit from wallet
      const { data: debitResult, error: debitError } = await adminClient
        .rpc("debit_wallet", {
          p_tenant_id: credential.tenant_id,
          p_amount: totalCostPrice,
          p_description: `Custo produto - ${orderNumber}`,
          p_reference_id: null, // Will be set after we get order ID
          p_reference_type: "order",
        });

      if (debitError || !(debitResult as any)?.success) {
        // Insufficient funds → mark as pending_credit
        console.log(`Insufficient credit for tenant ${credential.tenant_id}: need ${totalCostPrice}, reason: ${(debitResult as any)?.reason}`);

        // Update the order we just created to pending_credit
        const { data: orderRow } = await adminClient
          .from("orders")
          .select("id")
          .eq("ml_order_id", String(mlOrderId))
          .eq("tenant_id", credential.tenant_id)
          .single();

        if (orderRow) {
          await adminClient
            .from("orders")
            .update({ status: "pending_credit", updated_at: new Date().toISOString() })
            .eq("id", orderRow.id);
        }

        mappedStatus = "pending_credit";
        console.log(`Order ${orderNumber} set to pending_credit (cost: R$${totalCostPrice})`);

        // Notify seller about blocked order
        try {
          await adminClient.rpc("create_notification", {
            p_tenant_id: credential.tenant_id,
            p_type: "order_blocked",
            p_title: "Pedido bloqueado por crédito",
            p_message: `O pedido #${orderNumber} precisa de R$ ${totalCostPrice.toFixed(2)} mas seu saldo é insuficiente. Recarregue sua carteira.`,
            p_action_url: "/seller/credito",
            p_metadata: { order_number: orderNumber, cost: totalCostPrice },
          });
        } catch (notifErr) {
          console.warn("Failed to create notification:", notifErr);
        }
      } else {
        console.log(`Wallet debited: tenant=${credential.tenant_id}, cost=${totalCostPrice}, balance=${(debitResult as any)?.balance}`);
      }
    }
  }

  // 8. Update stock (reserve) for approved orders (NOT pending_credit)
  if (mappedStatus === "approved" && !existingOrder) {
    for (const item of orderItems) {
      if (!item.product_id) continue;

      const { data: stockRow } = await adminClient
        .from("stock")
        .select("id, reserved")
        .eq("product_id", item.product_id)
        .single();

      if (stockRow) {
        await adminClient
          .from("stock")
          .update({
            reserved: (stockRow.reserved || 0) + item.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", stockRow.id);

        console.log(`Reserved ${item.quantity} units of product ${item.product_id}`);

        // Trigger stock check
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          await fetch(`${supabaseUrl}/functions/v1/ml-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ action: "stock_check", product_id: item.product_id }),
          });
        } catch (err) {
          console.warn("Stock check trigger failed:", err);
        }
      }
    }
  }

  // 9. Auto-create picking_task for approved orders (NOT pending_credit)
  if (mappedStatus === "approved") {
    // Get the order ID from DB
    const { data: orderRow } = await adminClient
      .from("orders")
      .select("id")
      .eq("ml_order_id", String(mlOrderId))
      .eq("tenant_id", credential.tenant_id)
      .single();

    if (orderRow) {
      // Check if picking task already exists
      const { data: existingTask } = await adminClient
        .from("picking_tasks")
        .select("id")
        .eq("order_id", orderRow.id)
        .single();

      if (!existingTask) {
        const { error: taskError } = await adminClient
          .from("picking_tasks")
          .insert({
            order_id: orderRow.id,
            status: "pending",
          });

        if (taskError) {
          console.warn("Failed to create picking task:", taskError);
        } else {
          console.log(`Auto-created picking_task for order ${orderRow.id}`);
        }
      }
    }

    // Also create shipment record if shipping info available
    if (orderData.shipping?.id && orderRow) {
      const { data: existingShipment } = await adminClient
        .from("shipments")
        .select("id")
        .eq("order_id", orderRow.id)
        .single();

      if (!existingShipment) {
        await adminClient.from("shipments").insert({
          order_id: orderRow.id,
          tenant_id: credential.tenant_id,
          carrier: "Mercado Envios",
          tracking_code: trackingCode,
          status: "pending",
          ml_shipment_id: String(orderData.shipping.id),
        });
        console.log(`Auto-created shipment for order ${orderRow.id}, ML shipment ${orderData.shipping.id}`);
      }
    }
  }

  console.log(`Order webhook processed: ${orderNumber}, status=${mappedStatus}`);
}

// ─── HANDLE SHIPMENT NOTIFICATION ────────────────────────────────────
async function handleShipmentNotification(
  adminClient: any,
  credential: { id: string; tenant_id: string; access_token: string; ml_user_id: string },
  resource: string,
) {
  // resource format: "/shipments/12345678"
  const mlShipmentId = resource?.replace("/shipments/", "");
  if (!mlShipmentId) {
    console.warn("No shipment ID in resource:", resource);
    return;
  }

  console.log(`Processing shipment notification: ${mlShipmentId} for tenant ${credential.tenant_id}`);

  // Fetch shipment details from ML
  const shipRes = await fetch(`${ML_API}/shipments/${mlShipmentId}`, {
    headers: {
      Authorization: `Bearer ${credential.access_token}`,
      Accept: "application/json",
    },
  });

  if (!shipRes.ok) {
    console.error(`Failed to fetch shipment ${mlShipmentId}:`, await shipRes.text());
    return;
  }

  const shipData = await shipRes.json();
  console.log(`Shipment ${mlShipmentId}: status=${shipData.status}, tracking=${shipData.tracking_number}`);

  // Find our shipment record
  const { data: shipment } = await adminClient
    .from("shipments")
    .select("id, order_id")
    .eq("ml_shipment_id", String(mlShipmentId))
    .single();

  if (!shipment) {
    console.log(`No local shipment found for ML shipment ${mlShipmentId}`);
    return;
  }

  // Map ML shipment status to our order status
  const shipmentStatusMap: Record<string, string> = {
    shipped: "shipped",
    delivered: "delivered",
  };

  const newOrderStatus = shipmentStatusMap[shipData.status];

  if (newOrderStatus) {
    // Update order status
    await adminClient
      .from("orders")
      .update({
        status: newOrderStatus,
        tracking_code: shipData.tracking_number || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.order_id);

    // Update shipment record
    await adminClient
      .from("shipments")
      .update({
        status: newOrderStatus,
        tracking_code: shipData.tracking_number || null,
        ...(newOrderStatus === "shipped" ? { shipped_at: new Date().toISOString() } : {}),
      })
      .eq("id", shipment.id);

    console.log(`Shipment ${mlShipmentId}: order ${shipment.order_id} → ${newOrderStatus}`);
  }
}
