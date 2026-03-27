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

    // Get caller's profile (admin/operator can access)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const { action, order_id, shipment_id } = body;

    if (action === "get_label") {
      // Get shipment record
      const { data: shipment } = await adminClient
        .from("shipments")
        .select("*, orders!inner(tenant_id, ml_order_id)")
        .eq("id", shipment_id || "")
        .single();

      if (!shipment) {
        // Try by order_id
        const { data: shipByOrder } = await adminClient
          .from("shipments")
          .select("*, orders!inner(tenant_id, ml_order_id)")
          .eq("order_id", order_id || "")
          .single();

        if (!shipByOrder) {
          return new Response(JSON.stringify({ error: "Envio não encontrado" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        Object.assign(shipment || {}, shipByOrder);
      }

      const finalShipment = shipment;
      const tenantId = (finalShipment as any).orders?.tenant_id;
      const mlShipmentId = finalShipment?.ml_shipment_id;

      if (!mlShipmentId) {
        return new Response(JSON.stringify({ error: "Envio sem ID do Mercado Livre" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get ML credentials for the tenant
      const { data: cred } = await adminClient
        .from("ml_credentials")
        .select("access_token, expires_at")
        .eq("tenant_id", tenantId)
        .single();

      if (!cred) {
        return new Response(JSON.stringify({ error: "Credenciais ML não encontradas" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(cred.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Token ML expirado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch shipment details from ML
      const shipRes = await fetch(`${ML_API}/shipments/${mlShipmentId}`, {
        headers: {
          Authorization: `Bearer ${cred.access_token}`,
          Accept: "application/json",
        },
      });

      if (!shipRes.ok) {
        const errData = await shipRes.text();
        console.error("ML shipment fetch error:", errData);
        return new Response(JSON.stringify({ error: "Erro ao consultar envio no ML", ml_error: errData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const shipData = await shipRes.json();

      // Get label URL - ML provides ZPL or PDF label
      let labelUrl = null;

      // Try to get label from ML API
      // The label endpoint is: GET /shipment_labels?shipment_ids={id}&response_type=pdf
      const labelApiUrl = `${ML_API}/shipment_labels?shipment_ids=${mlShipmentId}&response_type=pdf&access_token=${cred.access_token}`;

      // Update shipment record with latest data
      const updateData: Record<string, unknown> = {
        tracking_code: shipData.tracking_number || finalShipment?.tracking_code,
        carrier: shipData.logistic_type || shipData.shipping_option?.name || "Mercado Envios",
        label_url: labelApiUrl,
        updated_at: new Date().toISOString(),
      };

      if (shipData.status === "shipped") {
        updateData.shipped_at = shipData.status_history?.date_shipped || new Date().toISOString();
        updateData.status = "shipped";
      } else if (shipData.status === "delivered") {
        updateData.delivered_at = shipData.status_history?.date_delivered || new Date().toISOString();
        updateData.status = "delivered";
      } else if (shipData.status === "ready_to_ship") {
        updateData.status = "ready";
      }

      await adminClient
        .from("shipments")
        .update(updateData)
        .eq("id", finalShipment?.id);

      return new Response(
        JSON.stringify({
          label_url: labelApiUrl,
          tracking_code: shipData.tracking_number,
          carrier: shipData.logistic_type,
          status: shipData.status,
          receiver: shipData.receiver_address,
          dimensions: shipData.shipping_option?.dimensions,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ml-shipping-label error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
