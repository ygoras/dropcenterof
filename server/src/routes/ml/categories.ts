import type { FastifyInstance } from 'fastify';
import { logger } from '../../lib/logger.js';

const ML_API = 'https://api.mercadolibre.com';
const ML_SITE = 'MLB';

export async function registerMlCategoryRoutes(app: FastifyInstance) {
  // ─── ML Categories proxy (no auth - public ML API) ─────────────────
  app.get('/api/ml/categories', async (request, reply) => {
    const { action, q, category_id } = request.query as {
      action?: string; q?: string; category_id?: string;
    };

    try {
      switch (action) {
        // Search categories by query string
        case 'search': {
          if (!q) {
            return reply.status(400).send({ error: "Parâmetro 'q' obrigatório" });
          }

          const [domainRes, predictorRes] = await Promise.all([
            fetch(`${ML_API}/sites/${ML_SITE}/domain_discovery/search?q=${encodeURIComponent(q)}`),
            fetch(`${ML_API}/sites/${ML_SITE}/category_predictor/predict?title=${encodeURIComponent(q)}`),
          ]);

          const domainData: any = await domainRes.json();
          const predictorData: any = await predictorRes.json();

          const categories: Array<{ id: string; name: string; path: string }> = [];

          // Add predicted category
          if (predictorData?.id) {
            const catRes = await fetch(`${ML_API}/categories/${predictorData.id}`);
            const catData: any = await catRes.json();
            if (catData?.id) {
              const path = (catData.path_from_root || [])
                .map((p: { name: string }) => p.name)
                .join(' > ');
              categories.push({ id: catData.id, name: catData.name, path });
            }
          }

          // Add domain discovery results
          if (Array.isArray(domainData)) {
            for (const domain of domainData.slice(0, 8)) {
              if (domain.category_id && !categories.find((c) => c.id === domain.category_id)) {
                const catRes = await fetch(`${ML_API}/categories/${domain.category_id}`);
                const catData: any = await catRes.json();
                if (catData?.id) {
                  const path = (catData.path_from_root || [])
                    .map((p: { name: string }) => p.name)
                    .join(' > ');
                  categories.push({ id: catData.id, name: catData.name, path });
                }
              }
            }
          }

          return reply.send({ categories });
        }

        // Get required attributes for a category
        case 'attributes': {
          if (!category_id) {
            return reply.status(400).send({ error: "Parâmetro 'category_id' obrigatório" });
          }

          const [catRes, attrsRes] = await Promise.all([
            fetch(`${ML_API}/categories/${category_id}`),
            fetch(`${ML_API}/categories/${category_id}/attributes`),
          ]);

          const catData: any = await catRes.json();
          const attrsData: any = await attrsRes.json();

          if (!Array.isArray(attrsData)) {
            return reply.status(400).send({ error: 'Erro ao buscar atributos', raw: attrsData });
          }

          const attributes = attrsData
            .filter((attr: any) => {
              const isRequired = attr.tags?.required || attr.tags?.catalog_required;
              const isRelevant = attr.relevance === 1 || attr.relevance === 2;
              return isRequired || isRelevant;
            })
            .map((attr: any) => ({
              id: attr.id,
              name: attr.name,
              type: attr.value_type,
              required: !!(attr.tags?.required || attr.tags?.catalog_required),
              tooltip: attr.hint || null,
              values: attr.values
                ? attr.values.slice(0, 100).map((v: any) => ({ id: v.id, name: v.name }))
                : [],
              default_value: attr.default_value || null,
              allowed_units: attr.allowed_units
                ? attr.allowed_units.map((u: any) => ({ id: u.id, name: u.name }))
                : [],
            }));

          const categoryPath = (catData.path_from_root || [])
            .map((p: { name: string }) => p.name)
            .join(' > ');

          return reply.send({
            category: { id: catData.id, name: catData.name, path: categoryPath },
            attributes,
            total_attributes: attrsData.length,
            required_count: attributes.filter((a: any) => a.required).length,
          });
        }

        // Browse root categories
        case 'browse': {
          const res = await fetch(`${ML_API}/sites/${ML_SITE}/categories`);
          const data: any = await res.json();

          return reply.send({
            categories: data.map((c: any) => ({ id: c.id, name: c.name })),
          });
        }

        // Get children of a category
        case 'children': {
          if (!category_id) {
            return reply.status(400).send({ error: "Parâmetro 'category_id' obrigatório" });
          }

          const res = await fetch(`${ML_API}/categories/${category_id}`);
          const data: any = await res.json();

          return reply.send({
            category: { id: data.id, name: data.name },
            children: (data.children_categories || []).map((c: any) => ({
              id: c.id,
              name: c.name,
              total_items: c.total_items_in_this_category,
            })),
          });
        }

        default:
          return reply.status(400).send({ error: 'Ação inválida. Use: search, attributes, browse, children' });
      }
    } catch (err) {
      logger.error({ err }, 'ml-categories error');
      return reply.status(500).send({ error: 'Erro interno ao consultar categorias' });
    }
  });
}
