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
    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with caller's token to verify identity
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id);

    const isAdmin = roles?.some((r: { role: string }) => r.role === "admin" || r.role === "manager");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas admins podem criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body - read as text first for debugging
    const rawBody = await req.text();
    console.log("Raw body received:", rawBody);
    
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch (_parseError) {
      console.error("Failed to parse body:", rawBody);
      return new Response(JSON.stringify({ error: "Corpo da requisição inválido", raw: rawBody.substring(0, 200) }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = body.email as string;
    const password = body.password as string;
    const name = body.name as string;
    const phone = body.phone as string | undefined;
    const tenant_id = body.tenant_id as string | undefined;
    const userRole = (body.role as string) || "seller";

    console.log("Parsed fields:", { hasEmail: !!email, hasPassword: !!password, hasName: !!name, role: userRole });

    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando", debug: { keys: Object.keys(body), hasEmail: !!email, hasPassword: !!password, hasName: !!name } }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sellers require tenant_id, operators don't
    if (userRole === "seller" && !tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório para vendedores" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user using admin API (does NOT affect caller's session)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Update profile with tenant and phone (tenant optional for operators)
    if (tenant_id) {
      await adminClient
        .from("profiles")
        .update({ phone: phone || null, tenant_id })
        .eq("id", userId);
    } else if (phone) {
      await adminClient
        .from("profiles")
        .update({ phone })
        .eq("id", userId);
    }

    // Assign role
    await adminClient.from("user_roles").insert({ user_id: userId, role: userRole });

    return new Response(JSON.stringify({ user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
