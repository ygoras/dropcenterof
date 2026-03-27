import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Asaas API (sandbox: https://sandbox.asaas.com/api/v3 | prod: https://api.asaas.com/v3)
const ASAAS_API = Deno.env.get("ASAAS_SANDBOX") === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

async function getOrCreateAsaasCustomer(
  adminClient: any,
  asaasApiKey: string,
  tenantId: string,
  tenantName: string,
  email: string,
  document?: string
): Promise<string> {
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, name, document, settings")
    .eq("id", tenantId)
    .single();

  let asaasCustomerId = (tenant?.settings as any)?.asaas_customer_id;

  if (!asaasCustomerId) {
    const customerRes = await fetch(`${ASAAS_API}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: asaasApiKey },
      body: JSON.stringify({
        name: tenant?.name || tenantName,
        email,
        cpfCnpj: (tenant?.document || document)?.replace(/\D/g, "") || undefined,
        externalReference: tenantId,
      }),
    });

    if (!customerRes.ok) {
      const errText = await customerRes.text();
      throw new Error(`Erro ao criar cliente no Asaas: ${errText}`);
    }

    const customerData = await customerRes.json();
    asaasCustomerId = customerData.id;

    await adminClient
      .from("tenants")
      .update({
        settings: { ...(tenant?.settings || {}), asaas_customer_id: asaasCustomerId },
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
  }

  return asaasCustomerId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

  if (!asaasApiKey) {
    return new Response(
      JSON.stringify({ error: "ASAAS_API_KEY não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller's profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id, name, email")
      .eq("id", userId)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const { action } = body;

    // ─── ACTION: generate_pix (recarga de carteira) ───────────────
    if (action === "generate_pix") {
      const { amount } = body;

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Valor inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tenant } = await adminClient
        .from("tenants")
        .select("id, name, document, settings")
        .eq("id", profile.tenant_id)
        .single();

      const asaasCustomerId = await getOrCreateAsaasCustomer(
        adminClient, asaasApiKey, profile.tenant_id,
        tenant?.name || profile.name, profile.email, tenant?.document
      );

      // Create PIX charge in Asaas
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);

      const chargeRes = await fetch(`${ASAAS_API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: asaasApiKey },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "PIX",
          value: amount,
          dueDate: dueDate.toISOString().split("T")[0],
          description: `Recarga de créditos - ${tenant?.name || "Vendedor"}`,
          externalReference: `wallet:${profile.tenant_id}`,
        }),
      });

      if (!chargeRes.ok) {
        const errText = await chargeRes.text();
        console.error("Asaas charge creation error:", errText);
        return new Response(
          JSON.stringify({ error: "Erro ao criar cobrança PIX", details: errText }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const chargeData = await chargeRes.json();

      // Get PIX QR Code
      const pixRes = await fetch(`${ASAAS_API}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: asaasApiKey },
      });

      let pixData = { encodedImage: null, payload: null, expirationDate: null };
      if (pixRes.ok) {
        pixData = await pixRes.json();
      }

      // Record pending transaction in wallet_transactions
      await adminClient.from("wallet_transactions").insert({
        tenant_id: profile.tenant_id,
        type: "deposit",
        amount,
        status: "pending",
        description: `Recarga PIX - R$ ${amount.toFixed(2)}`,
        reference_id: chargeData.id,
        reference_type: "asaas_pix",
        metadata: {
          asaas_payment_id: chargeData.id,
          pix_code: pixData.payload,
          pix_qr_image: pixData.encodedImage,
          due_date: dueDate.toISOString(),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: chargeData.id,
          pix_code: pixData.payload,
          pix_qr_image: pixData.encodedImage,
          pix_expiration: pixData.expirationDate,
          amount,
          status: chargeData.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── ACTION: generate_plan_charge (cobrança de plano) ─────────
    if (action === "generate_plan_charge") {
      // Check if caller is admin
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "manager");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { tenant_id, subscription_id } = body;

      if (!tenant_id || !subscription_id) {
        return new Response(JSON.stringify({ error: "tenant_id e subscription_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get subscription + plan details
      const { data: subscription } = await adminClient
        .from("subscriptions")
        .select("id, tenant_id, plan_id, status, billing_day")
        .eq("id", subscription_id)
        .single();

      if (!subscription) {
        return new Response(JSON.stringify({ error: "Assinatura não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: plan } = await adminClient
        .from("plans")
        .select("id, name, price")
        .eq("id", subscription.plan_id)
        .single();

      if (!plan) {
        return new Response(JSON.stringify({ error: "Plano não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get tenant + seller profile for Asaas customer
      const { data: tenant } = await adminClient
        .from("tenants")
        .select("id, name, document, settings")
        .eq("id", tenant_id)
        .single();

      const { data: sellerProfile } = await adminClient
        .from("profiles")
        .select("name, email")
        .eq("tenant_id", tenant_id)
        .limit(1)
        .single();

      const asaasCustomerId = await getOrCreateAsaasCustomer(
        adminClient, asaasApiKey, tenant_id,
        tenant?.name || "Vendedor", sellerProfile?.email || "", tenant?.document
      );

      // Calculate due date based on billing_day
      const now = new Date();
      let dueDate = new Date(now.getFullYear(), now.getMonth(), subscription.billing_day || 10);
      if (dueDate <= now) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      // Create PIX charge in Asaas
      const chargeRes = await fetch(`${ASAAS_API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: asaasApiKey },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "PIX",
          value: plan.price,
          dueDate: dueDate.toISOString().split("T")[0],
          description: `Plano ${plan.name} - ${tenant?.name || "Vendedor"}`,
          externalReference: `plan:${tenant_id}:${subscription_id}`,
        }),
      });

      if (!chargeRes.ok) {
        const errText = await chargeRes.text();
        console.error("Asaas plan charge error:", errText);
        return new Response(
          JSON.stringify({ error: "Erro ao criar cobrança", details: errText }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const chargeData = await chargeRes.json();

      // Get PIX QR Code
      const pixRes = await fetch(`${ASAAS_API}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: asaasApiKey },
      });

      let pixData = { encodedImage: null, payload: null, expirationDate: null };
      if (pixRes.ok) {
        pixData = await pixRes.json();
      }

      // Create payment record in payments table
      const { error: paymentError } = await adminClient.from("payments").insert({
        subscription_id,
        tenant_id,
        amount: plan.price,
        due_date: dueDate.toISOString().split("T")[0],
        status: "pending",
        pix_code: pixData.payload || null,
        pix_qr_url: pixData.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : null,
        payment_gateway_id: chargeData.id,
      });

      if (paymentError) {
        console.error("Error saving payment:", paymentError);
      }

      // Notify seller
      try {
        await adminClient.rpc("create_notification", {
          p_tenant_id: tenant_id,
          p_type: "plan_charge",
          p_title: `Cobrança do Plano ${plan.name}`,
          p_message: `Uma cobrança PIX de R$ ${plan.price.toFixed(2)} foi gerada. Vencimento: ${dueDate.toLocaleDateString("pt-BR")}.`,
          p_action_url: "/seller/credito",
          p_metadata: { plan_name: plan.name, amount: plan.price, asaas_id: chargeData.id },
        });
      } catch (notifErr) {
        console.warn("Failed to create notification:", notifErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: chargeData.id,
          pix_code: pixData.payload,
          pix_qr_image: pixData.encodedImage,
          amount: plan.price,
          due_date: dueDate.toISOString().split("T")[0],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── ACTION: get_balance ──────────────────────────────────────
    if (action === "get_balance") {
      const { data: wallet } = await adminClient
        .from("wallet_balances")
        .select("balance, updated_at")
        .eq("tenant_id", profile.tenant_id)
        .single();

      return new Response(
        JSON.stringify({
          balance: wallet?.balance ?? 0,
          updated_at: wallet?.updated_at ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── ACTION: get_transactions ─────────────────────────────────
    if (action === "get_transactions") {
      const { limit = 50 } = body;

      const { data: transactions } = await adminClient
        .from("wallet_transactions")
        .select("*")
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      return new Response(
        JSON.stringify({ transactions: transactions ?? [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── ACTION: get_spending_forecast ────────────────────────────
    if (action === "get_spending_forecast") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentOrders } = await adminClient
        .from("orders")
        .select("items, created_at")
        .eq("tenant_id", profile.tenant_id)
        .not("status", "in", '("cancelled","returned")')
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      const { data: products } = await adminClient
        .from("products")
        .select("id, cost_price, name");

      const productCostMap = new Map(
        (products ?? []).map((p: any) => [p.id, p.cost_price]),
      );

      let totalCost = 0;
      let orderCount = 0;

      for (const order of recentOrders ?? []) {
        const items = order.items as any[];
        if (!items) continue;
        orderCount++;
        for (const item of items) {
          const cost = productCostMap.get(item.product_id) ?? 0;
          totalCost += cost * (item.quantity || 1);
        }
      }

      const daysInPeriod = Math.max(1, Math.ceil(
        (Date.now() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24),
      ));

      const avgDailyCost = totalCost / daysInPeriod;
      const weeklyForecast = avgDailyCost * 7;
      const monthlyForecast = avgDailyCost * 30;
      const avgOrdersPerDay = orderCount / daysInPeriod;

      const { data: wallet } = await adminClient
        .from("wallet_balances")
        .select("balance")
        .eq("tenant_id", profile.tenant_id)
        .single();

      const currentBalance = wallet?.balance ?? 0;
      const daysUntilEmpty = avgDailyCost > 0
        ? Math.floor(currentBalance / avgDailyCost)
        : null;

      return new Response(
        JSON.stringify({
          period_days: daysInPeriod,
          total_cost_30d: Math.round(totalCost * 100) / 100,
          total_orders_30d: orderCount,
          avg_daily_cost: Math.round(avgDailyCost * 100) / 100,
          avg_orders_per_day: Math.round(avgOrdersPerDay * 100) / 100,
          weekly_forecast: Math.round(weeklyForecast * 100) / 100,
          monthly_forecast: Math.round(monthlyForecast * 100) / 100,
          current_balance: currentBalance,
          days_until_empty: daysUntilEmpty,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("asaas-pix error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
