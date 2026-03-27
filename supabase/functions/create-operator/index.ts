import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "1.0.0";

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
    console.log(`[create-operator v${VERSION}] Request received`);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("Missing env vars:", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey, hasAnon: !!anonKey });
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id);

    const isAdmin = roles?.some((r: { role: string }) => r.role === "admin" || r.role === "manager");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas admins podem criar operadores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const rawBody = await req.text();
    console.log("[create-operator] Raw body length:", rawBody.length);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch (_e) {
      return new Response(JSON.stringify({ error: "JSON inválido", raw: rawBody.substring(0, 100) }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = body.name as string;
    const email = body.email as string;
    const password = body.password as string;
    const phone = (body.phone as string) || null;
    const role = (body.role as string) || "operator";

    const allowedRoles = ["admin", "manager", "operator"];
    if (!allowedRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Role inválida: ${role}. Permitidas: ${allowedRoles.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-operator] Fields:", { hasName: !!name, hasEmail: !!email, hasPassword: !!password, role });

    if (!name || !email || !password) {
      return new Response(
        JSON.stringify({
          error: "Campos obrigatórios faltando",
          _version: VERSION,
          debug: { keys: Object.keys(body), hasName: !!name, hasEmail: !!email, hasPassword: !!password },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message, _version: VERSION }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Update phone if provided
    if (phone) {
      await adminClient.from("profiles").update({ phone }).eq("id", userId);
    }

    // Assign role
    await adminClient.from("user_roles").insert({ user_id: userId, role });

    console.log("[create-operator] Operator created:", userId);

    return new Response(JSON.stringify({ user_id: userId, _version: VERSION }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[create-operator] Error:", error);
    return new Response(JSON.stringify({ error: error.message, _version: VERSION }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
