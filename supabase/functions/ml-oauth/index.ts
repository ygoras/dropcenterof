import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function buildSuccessPage(displayName: string): string {
  // window.close() fails on redirected popups (browser security).
  // Show a styled success page and attempt close as best-effort.
  const parts: string[] = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="pt-BR"><head><meta charset="UTF-8">');
  parts.push('<meta name="viewport" content="width=device-width,initial-scale=1.0">');
  parts.push('<title>Conta Conectada</title>');
  parts.push('<style>');
  parts.push('*{margin:0;padding:0;box-sizing:border-box}');
  parts.push('body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1729;color:#e2e8f0}');
  parts.push('.c{text-align:center;background:#1a2332;padding:48px 40px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.4);border:1px solid rgba(99,102,241,.2);max-width:420px;width:90%}');
  parts.push('.i{font-size:56px;margin-bottom:20px}');
  parts.push('h1{font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:8px}');
  parts.push('.n{display:inline-block;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:8px;padding:8px 16px;margin:12px 0;font-weight:600;color:#a5b4fc;font-size:15px}');
  parts.push('.s{color:#94a3b8;font-size:14px;margin-top:16px}');
  parts.push('</style></head><body>');
  parts.push('<div class="c">');
  parts.push('<div class="i">&#127881;</div>');
  parts.push('<h1>Conta conectada com sucesso!</h1>');
  parts.push('<div class="n">' + displayName + '</div>');
  parts.push('<p class="s">Voc&#234; j&#225; pode fechar esta aba.</p>');
  parts.push('</div>');
  parts.push('<script>');
  parts.push('try{if(window.opener){window.opener.postMessage({type:"ML_OAUTH_SUCCESS"},"*")}}catch(e){}');
  parts.push('try{window.close()}catch(e){}');
  parts.push('</script>');
  parts.push('</body></html>');
  return parts.join('');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mlAppId = Deno.env.get("ML_APP_ID");
  const mlClientSecret = Deno.env.get("ML_CLIENT_SECRET");
  const redirectUri = supabaseUrl + "/functions/v1/ml-oauth";

  if (!mlAppId || !mlClientSecret) {
    return new Response(JSON.stringify({ error: "ML credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Step 1: If no code, redirect user to ML authorization page
    if (!code) {
      const body = await req.json().catch(() => null);

      if (!body?.tenant_id || !body?.user_id) {
        return new Response(JSON.stringify({ error: "tenant_id e user_id s\u00e3o obrigat\u00f3rios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const appUrl = body.app_url || "";
      const stateParam = body.tenant_id + "|" + body.user_id + "|" + appUrl;
      const authUrl = ML_AUTH_URL +
        "?response_type=code&client_id=" + mlAppId +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&state=" + encodeURIComponent(stateParam) +
        "&scope=offline_access";

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Callback — exchange code for tokens
    if (!state) {
      return new Response("<h1>Erro: state ausente</h1>", {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const stateParts = state.split("|");
    const tenantId = stateParts[0];
    const userId = stateParts[1];
    if (!tenantId || !userId) {
      return new Response("<h1>Erro: state inv\u00e1lido</h1>", {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(ML_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: mlAppId,
        client_secret: mlClientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("ML token error:", tokenData);
      return new Response("<h1>Erro ao obter token</h1><pre>" + JSON.stringify(tokenData) + "</pre>", {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const access_token = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;
    const expires_in = tokenData.expires_in;
    const mlUserId = tokenData.user_id;

    if (!refresh_token) {
      console.error("ML did not return refresh_token.");
      return new Response(
        "<h1>Erro: refresh_token ausente</h1><p>Verifique se o escopo offline_access est\u00e1 habilitado.</p>",
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Fetch ML user info for nickname
    const userInfoRes = await fetch("https://api.mercadolibre.com/users/" + mlUserId, {
      headers: { Authorization: "Bearer " + access_token },
    });
    const userInfo = await userInfoRes.json();
    const mlNickname = userInfo.nickname || null;

    // Save credentials to database
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const { error: upsertError } = await adminClient
      .from("ml_credentials")
      .upsert(
        {
          tenant_id: tenantId,
          user_id: userId,
          access_token: access_token,
          refresh_token: refresh_token,
          expires_at: expiresAt,
          ml_user_id: String(mlUserId),
          ml_nickname: mlNickname,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,ml_user_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response("<h1>Erro ao salvar credenciais</h1><pre>" + JSON.stringify(upsertError) + "</pre>", {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Return success HTML page
    const displayName = mlNickname || String(mlUserId);
    const html = buildSuccessPage(displayName);

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("ML OAuth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
