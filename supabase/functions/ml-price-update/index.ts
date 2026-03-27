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
    const { product_id, old_cost_price, new_cost_price } = body;

    if (!product_id || !old_cost_price || !new_cost_price) {
      return jsonResponse({ error: "product_id, old_cost_price e new_cost_price são obrigatórios" }, 400);
    }

    if (old_cost_price === new_cost_price) {
      return jsonResponse({ success: true, message: "Custo não alterado", updated: 0 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find all published listings for this product
    const { data: listings } = await adminClient
      .from("ml_listings")
      .select("id, ml_item_id, price, category_id, tenant_id, attributes")
      .eq("product_id", product_id)
      .not("ml_item_id", "is", null);

    if (!listings || listings.length === 0) {
      return jsonResponse({ success: true, message: "Nenhum anúncio publicado encontrado", updated: 0 });
    }

    // Calculate ratio: maintain the same markup proportion
    const ratio = new_cost_price / old_cost_price;

    const results: Array<{ listing_id: string; old_price: number; new_price: number; success: boolean; error?: string }> = [];

    for (const listing of listings) {
      const newPrice = Math.round(listing.price * ratio * 100) / 100;

      // Get tenant credentials
      const { data: cred } = await adminClient
        .from("ml_credentials")
        .select("*")
        .eq("tenant_id", listing.tenant_id)
        .single();

      if (!cred || new Date(cred.expires_at) < new Date()) {
        // Update locally even without ML sync
        await adminClient
          .from("ml_listings")
          .update({ price: newPrice, updated_at: new Date().toISOString() })
          .eq("id", listing.id);

        results.push({
          listing_id: listing.id,
          old_price: listing.price,
          new_price: newPrice,
          success: false,
          error: "Sem credenciais ML válidas - atualizado apenas localmente",
        });
        continue;
      }

      // Update price on ML
      try {
        const mlRes = await fetch(`${ML_API}/items/${listing.ml_item_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${cred.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ price: newPrice }),
        });

        const mlData = await mlRes.json();

        if (!mlRes.ok) {
          await adminClient
            .from("ml_listings")
            .update({ price: newPrice, sync_status: "error", updated_at: new Date().toISOString() })
            .eq("id", listing.id);

          results.push({
            listing_id: listing.id,
            old_price: listing.price,
            new_price: newPrice,
            success: false,
            error: mlData.message || "Erro ML",
          });
          continue;
        }

        // Fetch updated fees
        const listingTypeId = (listing.attributes as any)?._listing_type_id || "gold_pro";
        let saleFeeAmount = 0;
        let netAmount = newPrice;
        try {
          const categoryId = listing.category_id || "MLB1000";
          const feesUrl = `${ML_API}/sites/MLB/listing_prices?price=${newPrice}&category_id=${categoryId}&listing_type_id=${listingTypeId}&logistic_type=cross_docking&shipping_mode=me2`;
          const feesRes = await fetch(feesUrl, {
            headers: { Authorization: `Bearer ${cred.access_token}`, Accept: "application/json" },
          });
          if (feesRes.ok) {
            const feesData = await feesRes.json();
            const feeEntry = feesData.find((f: any) => f.listing_type_id === listingTypeId);
            if (feeEntry) {
              saleFeeAmount = feeEntry.sale_fee_amount || 0;
              netAmount = newPrice - saleFeeAmount;
            }
          }
        } catch (err) {
          console.warn("Could not fetch fees:", err);
        }

        await adminClient
          .from("ml_listings")
          .update({
            price: newPrice,
            sync_status: "synced",
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            attributes: {
              ...(listing.attributes || {}),
              _ml_sale_fee: saleFeeAmount,
              _ml_net_amount: netAmount,
            },
          })
          .eq("id", listing.id);

        results.push({
          listing_id: listing.id,
          old_price: listing.price,
          new_price: newPrice,
          success: true,
        });
      } catch (err) {
        results.push({
          listing_id: listing.id,
          old_price: listing.price,
          new_price: newPrice,
          success: false,
          error: String(err),
        });
      }
    }

    return jsonResponse({
      success: true,
      ratio,
      updated: results.filter((r) => r.success).length,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("ml-price-update error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
