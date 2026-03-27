import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ML_API = "https://api.mercadolibre.com";
const ML_SITE = "MLB"; // Brasil

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    switch (action) {
      // Search categories by query string
      case "search": {
        const query = url.searchParams.get("q");
        if (!query) {
          return jsonResponse({ error: "Parâmetro 'q' obrigatório" }, 400);
        }

        const res = await fetch(
          `${ML_API}/sites/${ML_SITE}/domain_discovery/search?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();

        // domain_discovery returns domains, we need to map to categories
        // Let's also try category_predictor for better results
        const predictorRes = await fetch(
          `${ML_API}/sites/${ML_SITE}/category_predictor/predict?title=${encodeURIComponent(query)}`
        );
        const predictorData = await predictorRes.json();

        // Combine results: predicted category + domain results
        const categories: Array<{ id: string; name: string; path: string }> = [];

        // Add predicted category
        if (predictorData?.id) {
          const catRes = await fetch(`${ML_API}/categories/${predictorData.id}`);
          const catData = await catRes.json();
          if (catData?.id) {
            const path = (catData.path_from_root || [])
              .map((p: { name: string }) => p.name)
              .join(" > ");
            categories.push({ id: catData.id, name: catData.name, path });
          }
        }

        // Add domain discovery results
        if (Array.isArray(data)) {
          for (const domain of data.slice(0, 8)) {
            if (domain.category_id && !categories.find((c) => c.id === domain.category_id)) {
              const catRes = await fetch(`${ML_API}/categories/${domain.category_id}`);
              const catData = await catRes.json();
              if (catData?.id) {
                const path = (catData.path_from_root || [])
                  .map((p: { name: string }) => p.name)
                  .join(" > ");
                categories.push({ id: catData.id, name: catData.name, path });
              }
            }
          }
        }

        return jsonResponse({ categories });
      }

      // Get required attributes for a category
      case "attributes": {
        const categoryId = url.searchParams.get("category_id");
        if (!categoryId) {
          return jsonResponse({ error: "Parâmetro 'category_id' obrigatório" }, 400);
        }

        // Get category details
        const catRes = await fetch(`${ML_API}/categories/${categoryId}`);
        const catData = await catRes.json();

        // Get attributes for the category
        const attrsRes = await fetch(
          `${ML_API}/categories/${categoryId}/attributes`
        );
        const attrsData = await attrsRes.json();

        if (!Array.isArray(attrsData)) {
          return jsonResponse({ error: "Erro ao buscar atributos", raw: attrsData }, 400);
        }

        // Filter to required attributes and format
        const attributes = attrsData
          .filter((attr: any) => {
            // Include required attributes and those with high relevance
            const isRequired = attr.tags?.required || attr.tags?.catalog_required;
            const isRelevant = attr.relevance === 1 || attr.relevance === 2;
            return isRequired || isRelevant;
          })
          .map((attr: any) => ({
            id: attr.id,
            name: attr.name,
            type: attr.value_type, // string, number, list, boolean
            required: !!(attr.tags?.required || attr.tags?.catalog_required),
            tooltip: attr.hint || null,
            values: attr.values
              ? attr.values.slice(0, 100).map((v: any) => ({
                  id: v.id,
                  name: v.name,
                }))
              : [],
            default_value: attr.default_value || null,
            allowed_units: attr.allowed_units
              ? attr.allowed_units.map((u: any) => ({ id: u.id, name: u.name }))
              : [],
          }));

        const categoryPath = (catData.path_from_root || [])
          .map((p: { name: string }) => p.name)
          .join(" > ");

        return jsonResponse({
          category: {
            id: catData.id,
            name: catData.name,
            path: categoryPath,
          },
          attributes,
          total_attributes: attrsData.length,
          required_count: attributes.filter((a: any) => a.required).length,
        });
      }

      // Browse root categories
      case "browse": {
        const res = await fetch(`${ML_API}/sites/${ML_SITE}/categories`);
        const data = await res.json();

        return jsonResponse({
          categories: data.map((c: any) => ({
            id: c.id,
            name: c.name,
          })),
        });
      }

      // Get children of a category
      case "children": {
        const parentId = url.searchParams.get("category_id");
        if (!parentId) {
          return jsonResponse({ error: "Parâmetro 'category_id' obrigatório" }, 400);
        }

        const res = await fetch(`${ML_API}/categories/${parentId}`);
        const data = await res.json();

        return jsonResponse({
          category: { id: data.id, name: data.name },
          children: (data.children_categories || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            total_items: c.total_items_in_this_category,
          })),
        });
      }

      default:
        return jsonResponse(
          { error: "Ação inválida. Use: search, attributes, browse, children" },
          400
        );
    }
  } catch (error) {
    console.error("ml-categories error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
