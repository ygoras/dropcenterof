import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASAAS_API = Deno.env.get("ASAAS_SANDBOX") === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET");

  // Auth: accept cron secret header OR valid admin JWT
  const incomingSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");

  if (cronSecret && incomingSecret !== cronSecret && !authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!asaasApiKey) {
    return new Response(
      JSON.stringify({ error: "ASAAS_API_KEY não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const today = new Date();
    const currentDay = today.getDate();

    console.log(`Billing cron running for day ${currentDay}`);

    // Find active subscriptions where billing_day = today
    const { data: subscriptions, error: subError } = await adminClient
      .from("subscriptions")
      .select("id, tenant_id, plan_id, billing_day, status")
      .eq("billing_day", currentDay)
      .in("status", ["active", "overdue"]);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return new Response(
        JSON.stringify({ error: subError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!subscriptions?.length) {
      console.log("No subscriptions to bill today");
      return new Response(
        JSON.stringify({ status: "ok", message: "No subscriptions due today", billed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ tenant_id: string; status: string; error?: string }> = [];

    for (const sub of subscriptions) {
      try {
        // Check if there's already a pending payment for this month
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0];

        const { data: existingPayment } = await adminClient
          .from("payments")
          .select("id, status")
          .eq("subscription_id", sub.id)
          .gte("due_date", monthStart)
          .lte("due_date", monthEnd)
          .in("status", ["pending", "confirmed"])
          .limit(1)
          .maybeSingle();

        if (existingPayment) {
          console.log(`Subscription ${sub.id} already has payment for this month, skipping`);
          results.push({ tenant_id: sub.tenant_id, status: "skipped_existing" });
          continue;
        }

        // Get plan
        const { data: plan } = await adminClient
          .from("plans")
          .select("id, name, price")
          .eq("id", sub.plan_id)
          .single();

        if (!plan || plan.price <= 0) {
          results.push({ tenant_id: sub.tenant_id, status: "skipped_free" });
          continue;
        }

        // Get tenant + Asaas customer
        const { data: tenant } = await adminClient
          .from("tenants")
          .select("id, name, document, settings")
          .eq("id", sub.tenant_id)
          .single();

        const { data: sellerProfile } = await adminClient
          .from("profiles")
          .select("name, email")
          .eq("tenant_id", sub.tenant_id)
          .limit(1)
          .maybeSingle();

        // Get or create Asaas customer
        let asaasCustomerId = (tenant?.settings as any)?.asaas_customer_id;

        if (!asaasCustomerId) {
          const customerRes = await fetch(`${ASAAS_API}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json", access_token: asaasApiKey },
            body: JSON.stringify({
              name: tenant?.name || "Vendedor",
              email: sellerProfile?.email || "",
              cpfCnpj: tenant?.document?.replace(/\D/g, "") || undefined,
              externalReference: sub.tenant_id,
            }),
          });

          if (!customerRes.ok) {
            const errText = await customerRes.text();
            console.error(`Failed to create Asaas customer for ${sub.tenant_id}:`, errText);
            results.push({ tenant_id: sub.tenant_id, status: "error", error: errText });
            continue;
          }

          const customerData = await customerRes.json();
          asaasCustomerId = customerData.id;

          await adminClient
            .from("tenants")
            .update({
              settings: { ...(tenant?.settings || {}), asaas_customer_id: asaasCustomerId },
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.tenant_id);
        }

        // Calculate due date
        const dueDate = new Date(today.getFullYear(), today.getMonth(), sub.billing_day || 10);
        if (dueDate < today) {
          dueDate.setMonth(dueDate.getMonth() + 1);
        }

        // Create charge in Asaas
        const chargeRes = await fetch(`${ASAAS_API}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", access_token: asaasApiKey },
          body: JSON.stringify({
            customer: asaasCustomerId,
            billingType: "PIX",
            value: plan.price,
            dueDate: dueDate.toISOString().split("T")[0],
            description: `Plano ${plan.name} - ${tenant?.name || "Vendedor"}`,
            externalReference: `plan:${sub.tenant_id}:${sub.id}`,
          }),
        });

        if (!chargeRes.ok) {
          const errText = await chargeRes.text();
          console.error(`Failed to create charge for ${sub.tenant_id}:`, errText);
          results.push({ tenant_id: sub.tenant_id, status: "error", error: errText });
          continue;
        }

        const chargeData = await chargeRes.json();

        // Get PIX QR Code
        const pixRes = await fetch(`${ASAAS_API}/payments/${chargeData.id}/pixQrCode`, {
          headers: { access_token: asaasApiKey },
        });

        let pixData = { encodedImage: null, payload: null };
        if (pixRes.ok) {
          pixData = await pixRes.json();
        }

        // Save payment record
        await adminClient.from("payments").insert({
          subscription_id: sub.id,
          tenant_id: sub.tenant_id,
          amount: plan.price,
          due_date: dueDate.toISOString().split("T")[0],
          status: "pending",
          pix_code: pixData.payload || null,
          pix_qr_url: pixData.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : null,
          payment_gateway_id: chargeData.id,
        });

        // Notify seller
        try {
          await adminClient.rpc("create_notification", {
            p_tenant_id: sub.tenant_id,
            p_type: "plan_charge",
            p_title: `Cobrança do Plano ${plan.name}`,
            p_message: `Sua cobrança mensal de R$ ${plan.price.toFixed(2)} foi gerada. Pague via PIX até ${dueDate.toLocaleDateString("pt-BR")}.`,
            p_action_url: "/seller/plano",
            p_metadata: { plan_name: plan.name, amount: plan.price, asaas_id: chargeData.id },
          });
        } catch (e) {
          console.warn("Notification error:", e);
        }

        console.log(`Billed tenant ${sub.tenant_id}: R$ ${plan.price} (Asaas: ${chargeData.id})`);
        results.push({ tenant_id: sub.tenant_id, status: "billed" });
      } catch (err: any) {
        console.error(`Error billing ${sub.tenant_id}:`, err);
        results.push({ tenant_id: sub.tenant_id, status: "error", error: err.message });
      }
    }

    const billed = results.filter((r) => r.status === "billed").length;
    const errors = results.filter((r) => r.status === "error").length;

    console.log(`Billing cron complete: ${billed} billed, ${errors} errors, ${results.length} total`);

    return new Response(
      JSON.stringify({ status: "ok", billed, errors, total: results.length, details: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("billing-cron error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
