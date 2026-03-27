import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasWebhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Optional: Validate webhook token from Asaas
    if (asaasWebhookToken) {
      const incomingToken = req.headers.get("asaas-access-token");
      if (incomingToken !== asaasWebhookToken) {
        console.warn("Invalid webhook token received");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    console.log("Asaas webhook received:", JSON.stringify(body));

    const { event, payment } = body;

    if (!payment) {
      return new Response(JSON.stringify({ status: "ignored", reason: "no_payment" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const asaasPaymentId = payment.id;
    const externalReference = payment.externalReference as string; // "wallet:tenant_id" or "plan:tenant_id:sub_id" or legacy "tenant_id"

    // Parse externalReference to determine type
    let refType: "wallet" | "plan" | "legacy" = "legacy";
    let tenantId = externalReference;
    let subscriptionId: string | null = null;

    if (externalReference?.startsWith("wallet:")) {
      refType = "wallet";
      tenantId = externalReference.replace("wallet:", "");
    } else if (externalReference?.startsWith("plan:")) {
      refType = "plan";
      const parts = externalReference.split(":");
      tenantId = parts[1];
      subscriptionId = parts[2] || null;
    }

    // ─── PAYMENT_CONFIRMED or PAYMENT_RECEIVED ────────────────────
    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      console.log(`Payment confirmed: ${asaasPaymentId}, type: ${refType}, tenant: ${tenantId}, amount: ${payment.value}`);

      if (!tenantId) {
        console.warn("No tenant_id in payment");
        return new Response(JSON.stringify({ status: "ignored", reason: "no_tenant" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const amount = payment.value;

      // ── PLAN PAYMENT ──
      if (refType === "plan") {
        // Update payment record in payments table
        const { data: paymentRecord } = await adminClient
          .from("payments")
          .select("id, status")
          .eq("payment_gateway_id", asaasPaymentId)
          .single();

        if (paymentRecord?.status === "confirmed") {
          console.log(`Plan payment ${asaasPaymentId} already confirmed, skipping`);
          return new Response(JSON.stringify({ status: "already_processed" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Confirm the payment
        if (paymentRecord) {
          await adminClient
            .from("payments")
            .update({
              status: "confirmed",
              paid_at: new Date().toISOString(),
            })
            .eq("id", paymentRecord.id);
        }

        // Reactivate subscription if it was overdue/blocked
        if (subscriptionId) {
          await adminClient
            .from("subscriptions")
            .update({ status: "active", blocked_at: null })
            .eq("id", subscriptionId);
        }

        // Reactivate seller profiles
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id")
          .eq("tenant_id", tenantId);

        if (profiles) {
          for (const p of profiles) {
            await adminClient.from("profiles").update({ is_active: true }).eq("id", p.id);
          }
        }

        // Notify seller
        try {
          await adminClient.rpc("create_notification", {
            p_tenant_id: tenantId,
            p_type: "plan_payment_confirmed",
            p_title: "Pagamento do plano confirmado!",
            p_message: `Seu pagamento de R$ ${amount.toFixed(2)} foi confirmado. Assinatura ativa.`,
            p_action_url: "/seller/dashboard",
            p_metadata: { amount, asaas_id: asaasPaymentId },
          });
        } catch (notifErr) {
          console.warn("Failed to create notification:", notifErr);
        }

        console.log(`Plan payment processed: tenant=${tenantId}, amount=${amount}`);

        return new Response(
          JSON.stringify({ status: "processed", type: "plan", amount }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ── WALLET RECHARGE ──
      // Idempotency check
      const { data: existingTx } = await adminClient
        .from("wallet_transactions")
        .select("id, status")
        .eq("reference_id", asaasPaymentId)
        .eq("type", "deposit")
        .single();

      if (existingTx?.status === "confirmed") {
        console.log(`Payment ${asaasPaymentId} already processed, skipping`);
        return new Response(JSON.stringify({ status: "already_processed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Credit the wallet using RPC
      const { data: creditResult, error: creditError } = await adminClient
        .rpc("credit_wallet", {
          p_tenant_id: tenantId,
          p_amount: amount,
          p_description: `Recarga PIX confirmada - Asaas #${asaasPaymentId}`,
          p_reference_id: asaasPaymentId,
          p_reference_type: "asaas_pix",
        });

      if (creditError) {
        console.error("Credit wallet error:", creditError);
        return new Response(
          JSON.stringify({ status: "error", reason: creditError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(`Wallet credited: tenant=${tenantId}, amount=${amount}, result:`, creditResult);

      // Notify payment confirmed
      try {
        await adminClient.rpc("create_notification", {
          p_tenant_id: tenantId,
          p_type: "payment_confirmed",
          p_title: "Recarga confirmada!",
          p_message: `Seu PIX de R$ ${amount.toFixed(2)} foi confirmado. Saldo atualizado.`,
          p_action_url: "/seller/credito",
          p_metadata: { amount, asaas_id: asaasPaymentId },
        });
      } catch (notifErr) {
        console.warn("Failed to create notification:", notifErr);
      }

      // Update pending transaction if exists
      if (existingTx) {
        await adminClient
          .from("wallet_transactions")
          .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
          .eq("id", existingTx.id);
      }

      // Process pending_credit orders queue
      const { data: processResult, error: processError } = await adminClient
        .rpc("process_pending_credit_orders", { p_tenant_id: tenantId });

      if (processError) {
        console.error("Process pending orders error:", processError);
      } else {
        console.log(`Processed pending_credit orders:`, processResult);

        const processedCount = (processResult as any)?.processed ?? 0;
        if (processedCount > 0) {
          // Notify about released orders
          try {
            await adminClient.rpc("create_notification", {
              p_tenant_id: tenantId,
              p_type: "orders_released",
              p_title: `${processedCount} pedido(s) liberado(s)`,
              p_message: `Seus pedidos bloqueados por crédito foram liberados e entraram na fila de separação.`,
              p_action_url: "/seller/pedidos",
              p_metadata: { processed: processedCount },
            });
          } catch (notifErr) {
            console.warn("Failed to create notification:", notifErr);
          }

          // Create picking tasks for newly approved orders
          const { data: approvedOrders } = await adminClient
            .from("orders")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("status", "approved")
            .order("updated_at", { ascending: false })
            .limit(processedCount);

          for (const order of approvedOrders ?? []) {
            const { data: existingTask } = await adminClient
              .from("picking_tasks")
              .select("id")
              .eq("order_id", order.id)
              .single();

            if (!existingTask) {
              await adminClient.from("picking_tasks").insert({
                order_id: order.id,
                status: "pending",
              });
              console.log(`Auto-created picking_task for order ${order.id}`);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          status: "processed",
          type: "wallet",
          credited: amount,
          balance: (creditResult as any)?.balance,
          orders_processed: (processResult as any)?.processed ?? 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── PAYMENT_OVERDUE ──────────────────────────────────────────
    if (event === "PAYMENT_OVERDUE") {
      if (refType === "plan") {
        // Mark plan payment as expired and subscription as overdue
        await adminClient
          .from("payments")
          .update({ status: "expired" })
          .eq("payment_gateway_id", asaasPaymentId);

        if (subscriptionId) {
          await adminClient
            .from("subscriptions")
            .update({ status: "overdue" })
            .eq("id", subscriptionId);
        }

        // Notify seller
        try {
          await adminClient.rpc("create_notification", {
            p_tenant_id: tenantId,
            p_type: "plan_overdue",
            p_title: "Pagamento do plano vencido!",
            p_message: `Seu plano está inadimplente. Regularize para evitar bloqueio.`,
            p_action_url: "/seller/dashboard",
            p_metadata: { asaas_id: asaasPaymentId },
          });
        } catch (notifErr) {
          console.warn("Failed to create notification:", notifErr);
        }
      } else {
        // Wallet recharge overdue
        await adminClient
          .from("wallet_transactions")
          .update({ status: "failed" })
          .eq("reference_id", asaasPaymentId)
          .eq("status", "pending");
      }

      console.log(`Payment overdue: ${asaasPaymentId}, type: ${refType}`);
      return new Response(JSON.stringify({ status: "marked_overdue", type: refType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PAYMENT_DELETED / PAYMENT_REFUNDED ───────────────────────
    if (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") {
      if (refType === "plan") {
        await adminClient
          .from("payments")
          .update({ status: event === "PAYMENT_REFUNDED" ? "refunded" : "expired" })
          .eq("payment_gateway_id", asaasPaymentId);
      } else {
        await adminClient
          .from("wallet_transactions")
          .update({ status: "cancelled" })
          .eq("reference_id", asaasPaymentId)
          .eq("status", "pending");

        // If refunded and was confirmed, debit back
        if (event === "PAYMENT_REFUNDED" && tenantId && payment.value) {
          const { data: refundResult } = await adminClient.rpc("debit_wallet", {
            p_tenant_id: tenantId,
            p_amount: payment.value,
            p_description: `Estorno PIX - Asaas #${asaasPaymentId}`,
            p_reference_id: asaasPaymentId,
            p_reference_type: "asaas_refund",
          });
          console.log(`Refund processed:`, refundResult);
        }
      }

      return new Response(JSON.stringify({ status: "processed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Other events (PAYMENT_CREATED, etc.) - just acknowledge
    console.log(`Asaas event ignored: ${event}`);
    return new Response(JSON.stringify({ status: "ignored", event }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("asaas-webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
