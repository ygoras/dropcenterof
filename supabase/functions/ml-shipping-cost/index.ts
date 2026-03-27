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
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller's tenant
    const { data: profile } = await adminClient.from("profiles").select("tenant_id").eq("id", user.id).single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Perfil sem tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ML credentials
    const { data: cred, error: credError } = await adminClient
      .from("ml_credentials")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (credError || !cred) {
      return new Response(JSON.stringify({ error: "Mercado Livre não conectado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(cred.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Token ML expirado. Reconecte sua conta." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const { dimensions, weight_kg, item_price, listing_type_id, condition, free_shipping, logistic_type, category_id } = body;

    // Validate required fields
    if (!dimensions && !weight_kg) {
      return new Response(JSON.stringify({ error: "Dimensões e peso são obrigatórios para calcular o frete" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build dimensions string: HxWxL,weight_in_grams
    const height = dimensions?.height || 10;
    const width = dimensions?.width || 10;
    const length = dimensions?.length || 10;
    const weightGrams = Math.round((weight_kg || 0.5) * 1000);

    const dimensionsStr = `${height}x${width}x${length},${weightGrams}`;

    // Build query params
    const queryParams: Record<string, string> = {
      dimensions: dimensionsStr,
      item_price: String(item_price || 100),
      listing_type_id: listing_type_id || "gold_special",
      mode: "me2",
      condition: condition || "new",
      free_shipping: String(free_shipping !== false),
      verbose: "true",
      logistic_type: logistic_type || "drop_off",
    };

    if (category_id) {
      queryParams.category_id = category_id;
    }

    const params = new URLSearchParams(queryParams);

    const mlUserId = cred.ml_user_id;
    const url = `${ML_API}/users/${mlUserId}/shipping_options/free?${params.toString()}`;

    console.log("Fetching ML shipping cost:", url);

    const mlResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cred.access_token}`,
        Accept: "application/json",
      },
    });

    const mlData = await mlResponse.json();

    if (!mlResponse.ok) {
      console.error("ML shipping cost error:", mlData);
      return new Response(
        JSON.stringify({
          error: "Erro ao consultar custo de frete no ML",
          ml_error: mlData.message || JSON.stringify(mlData),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Log full response for debugging
    console.log("ML shipping response:", JSON.stringify(mlData));

    // Extract cost - try multiple paths in the response
    let shippingCost = 0;

    // Path 1: coverage.all_country.list_cost (common for free shipping)
    if (mlData?.coverage?.all_country?.list_cost) {
      shippingCost = mlData.coverage.all_country.list_cost;
    }

    // Path 2: options array (items shipping_options format)
    if (!shippingCost && mlData?.options?.length > 0) {
      const maxOption = mlData.options.reduce(
        (max: any, opt: any) => ((opt.list_cost || 0) > (max.list_cost || 0) ? opt : max),
        mlData.options[0],
      );
      shippingCost = maxOption?.list_cost || maxOption?.cost || 0;
    }

    // Path 3: direct list_cost at root
    if (!shippingCost && mlData?.list_cost) {
      shippingCost = mlData.list_cost;
    }

    const currencyId = mlData?.coverage?.all_country?.currency_id || "BRL";
    const billableWeight = mlData?.coverage?.all_country?.billable_weight || 0;

    // Extract discount info if available
    const discount = mlData?.coverage?.discount || null;

    return new Response(
      JSON.stringify({
        shipping_cost: shippingCost,
        currency_id: currencyId,
        billable_weight: billableWeight,
        discount,
        dimensions_used: dimensionsStr,
        raw_coverage: mlData?.coverage || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("ml-shipping-cost error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
