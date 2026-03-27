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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin/manager
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado - header ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Use service role client to verify the user from the token
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    console.log("Auth debug - token length:", token.length, "error:", authError?.message, "user:", user?.id);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado", detail: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin/manager role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("manager")) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all data using service role (bypasses RLS)
    const [profilesRes, credentialsRes, listingsRes, tenantsRes, rolesRes, ordersRes] =
      await Promise.all([
        adminClient.from("profiles").select("id, name, email, tenant_id"),
        adminClient
          .from("ml_credentials")
          .select("tenant_id, ml_user_id, ml_nickname, expires_at, created_at, updated_at"),
        adminClient
          .from("ml_listings")
          .select("id, product_id, tenant_id, ml_item_id, title, price, status, category_id, sync_status, last_sync_at, attributes, created_at, updated_at, products:product_id(name, sku, images)")
          .order("created_at", { ascending: false }),
        adminClient.from("tenants").select("id, name"),
        adminClient.from("user_roles").select("user_id, role").eq("role", "seller"),
        adminClient
          .from("orders")
          .select("items")
          .not("status", "eq", "cancelled"),
      ]);

    return new Response(
      JSON.stringify({
        profiles: profilesRes.data || [],
        credentials: credentialsRes.data || [],
        listings: listingsRes.data || [],
        tenants: tenantsRes.data || [],
        sellerRoles: rolesRes.data || [],
        orders: ordersRes.data || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("admin-ml-overview error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
