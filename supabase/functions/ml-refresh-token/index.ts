import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mlAppId = Deno.env.get("ML_APP_ID");
  const mlClientSecret = Deno.env.get("ML_CLIENT_SECRET");

  if (!mlAppId || !mlClientSecret) {
    return new Response(JSON.stringify({ error: "ML credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Find credentials expiring in the next 30 minutes
    const threshold = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: expiring, error: fetchError } = await adminClient
      .from("ml_credentials")
      .select("*")
      .lt("expires_at", threshold);

    if (fetchError) {
      throw new Error(`Failed to fetch credentials: ${fetchError.message}`);
    }

    if (!expiring || expiring.length === 0) {
      return new Response(JSON.stringify({ refreshed: 0, message: "No tokens to refresh" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ credential_id: string; tenant_id: string; ml_user_id: string; store_name: string | null; success: boolean; error?: string }> = [];

    for (const cred of expiring) {
      try {
        console.log(`Refreshing token for credential ${cred.id} (tenant=${cred.tenant_id}, ml_user=${cred.ml_user_id}, store=${cred.store_name || cred.ml_nickname || "default"})`);

        const tokenRes = await fetch(ML_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            client_id: mlAppId,
            client_secret: mlClientSecret,
            refresh_token: cred.refresh_token,
          }),
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok) {
          console.error(`Refresh failed for credential ${cred.id} (tenant=${cred.tenant_id}, store=${cred.store_name || cred.ml_nickname}):`, tokenData);
          results.push({ credential_id: cred.id, tenant_id: cred.tenant_id, ml_user_id: cred.ml_user_id, store_name: cred.store_name || cred.ml_nickname, success: false, error: tokenData.message || "Token refresh failed" });
          continue;
        }

        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        await adminClient
          .from("ml_credentials")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cred.id);

        results.push({ credential_id: cred.id, tenant_id: cred.tenant_id, ml_user_id: cred.ml_user_id, store_name: cred.store_name || cred.ml_nickname, success: true });
        console.log(`Token refreshed for credential ${cred.id} (tenant=${cred.tenant_id}, store=${cred.store_name || cred.ml_nickname})`);
      } catch (err) {
        console.error(`Error refreshing credential ${cred.id} (tenant=${cred.tenant_id}):`, err);
        results.push({ credential_id: cred.id, tenant_id: cred.tenant_id, ml_user_id: cred.ml_user_id, store_name: cred.store_name || cred.ml_nickname, success: false, error: err.message });
      }
    }

    const refreshed = results.filter((r) => r.success).length;
    return new Response(JSON.stringify({ refreshed, total: expiring.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
