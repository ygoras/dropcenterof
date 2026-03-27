import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const { tenant_id } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mlAppId = Deno.env.get("ML_APP_ID");
    const mlClientSecret = Deno.env.get("ML_CLIENT_SECRET");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch full credentials (including ml_user_id for permission revocation)
    const { data: fullCred } = await adminClient
      .from("ml_credentials")
      .select("access_token, refresh_token, ml_user_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (fullCred && mlAppId) {
      // 2. Revoke APPLICATION PERMISSIONS via ML API (forces re-authorization on next connect)
      // DELETE /users/{user_id}/applications/{app_id}
      if (fullCred.access_token && fullCred.ml_user_id) {
        try {
          const revokeRes = await fetch(
            `https://api.mercadolibre.com/users/${fullCred.ml_user_id}/applications/${mlAppId}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${fullCred.access_token}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log("ML app permission revoke status:", revokeRes.status, "for tenant", tenant_id);
        } catch (revokeErr) {
          console.error("Failed to revoke ML app permissions (non-blocking):", revokeErr);
        }
      }

      // 3. Also revoke tokens (belt and suspenders)
      if (mlClientSecret) {
        const tokensToRevoke = [fullCred.access_token, fullCred.refresh_token].filter(Boolean);
        for (const token of tokensToRevoke) {
          try {
            await fetch("https://api.mercadolibre.com/oauth/token/revoke", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: mlAppId,
                client_secret: mlClientSecret,
                token,
              }),
            });
          } catch (revokeErr) {
            console.error("Failed to revoke ML token (non-blocking):", revokeErr);
          }
        }
        console.log("ML tokens revoked for tenant", tenant_id);
      }
    }

    // 4. Delete credentials from database
    const { error } = await adminClient
      .from("ml_credentials")
      .delete()
      .eq("tenant_id", tenant_id);

    if (error) {
      console.error("Delete error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Disconnect error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
