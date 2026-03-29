import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { useSSE } from "@/hooks/useSSE";
import type { Product, ProductCategory, ProductWithStock, ProductStatus } from "@/types/catalog";

async function logAudit(action: string, entity_type: string, entity_id?: string, details?: Record<string, unknown>) {
  try {
    await api.post("/api/audit", { action, entity_type, entity_id, details });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export function useProducts() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.get<ProductCategory[]>("/api/products/categories");
      setCategories(data ?? []);
    } catch (err) {
      console.error("Error fetching categories:", err);
      setCategories([]);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ProductWithStock[]>("/api/products");
      setProducts(data ?? []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar produtos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  // Realtime: auto-refresh when products or stock change via SSE
  useSSE(["products", "stock_movements"], () => {
    fetchProducts();
  });

  const createProduct = async (data: {
    sku: string;
    name: string;
    description?: string;
    brand?: string;
    category_id?: string;
    cost_price: number;
    sell_price: number;
    weight_kg?: number;
    dimensions?: { length: number; width: number; height: number };
    images?: string[];
    status?: ProductStatus;
    ml_category_id?: string;
    initial_stock?: number;
    min_stock?: number;
    condition?: string;
    gtin?: string;
    warranty_type?: string;
    warranty_time?: string;
    attributes?: Record<string, unknown>;
  }) => {
    try {
      await api.post("/api/products", {
        sku: data.sku,
        name: data.name,
        description: data.description || null,
        brand: data.brand || null,
        category_id: data.category_id || null,
        cost_price: data.cost_price,
        sell_price: data.sell_price,
        weight_kg: data.weight_kg || null,
        dimensions: data.dimensions || null,
        images: data.images || [],
        status: data.status || "active",
        ml_category_id: data.ml_category_id || null,
        condition: data.condition || "new",
        gtin: data.gtin || null,
        warranty_type: data.warranty_type || null,
        warranty_time: data.warranty_time || null,
        attributes: data.attributes || {},
        initial_stock: data.initial_stock ?? 0,
        min_stock: data.min_stock ?? 5,
      });

      toast({ title: "Produto criado!", description: `${data.name} adicionado ao catálogo.` });
      await fetchProducts();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao criar produto", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const updateProduct = async (id: string, data: Partial<Product>) => {
    // Check if cost_price changed - we need old value to recalculate listings
    const oldProduct = products.find(p => p.id === id);
    const costChanged = data.cost_price !== undefined && oldProduct && data.cost_price !== oldProduct.cost_price;
    const oldCostPrice = oldProduct?.cost_price;

    try {
      await api.patch(`/api/products/${id}`, { ...data, updated_at: new Date().toISOString() });
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
      return false;
    }

    // If cost changed, recalculate all listing prices automatically
    if (costChanged && oldCostPrice && data.cost_price) {
      try {
        const result = await api.post<{ updated?: number; error?: string }>("/api/ml/price-update", {
          product_id: id,
          old_cost_price: oldCostPrice,
          new_cost_price: data.cost_price,
        });

        if (result?.error) {
          console.error("Price update sync error:", result.error);
          toast({
            title: "Produto atualizado",
            description: `Custo alterado, mas houve erro ao atualizar anúncios: ${result.error}`,
            variant: "destructive",
          });
        } else if (result?.updated && result.updated > 0) {
          toast({
            title: "Produto e anúncios atualizados!",
            description: `${result.updated} anúncio(s) recalculado(s) automaticamente no Mercado Livre.`,
          });
        } else {
          toast({ title: "Produto atualizado!" });
        }
      } catch (err) {
        console.error("Error calling ml-price-update:", err);
        toast({ title: "Produto atualizado!", description: "Erro ao sincronizar anúncios." });
      }
    } else {
      toast({ title: "Produto atualizado!" });
    }

    await fetchProducts();
    return true;
  };

  const deleteProduct = async (id: string) => {
    try {
      await api.delete(`/api/products/${id}`);
      toast({ title: "Produto excluído!" });
      await fetchProducts();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const updateStock = async (productId: string, data: { quantity?: number; reserved?: number; min_stock?: number; location?: string }) => {
    try {
      await api.patch(`/api/stock/${productId}`, {
        quantity: data.quantity ?? 0,
        min_stock: data.min_stock ?? 5,
        reserved: data.reserved,
        location: data.location,
      });

      await logAudit("update", "stock", productId, { quantity: data.quantity, min_stock: data.min_stock });
      toast({ title: "Estoque atualizado!" });
      await fetchProducts();
      return true;
    } catch (err: any) {
      console.error("Stock update error:", err);
      toast({ title: "Erro ao atualizar estoque", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const createCategory = async (data: { name: string; slug: string; parent_id?: string; ml_category_id?: string }) => {
    try {
      await api.post("/api/products/categories", data);
      toast({ title: "Categoria criada!" });
      await fetchCategories();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao criar categoria", description: err.message, variant: "destructive" });
      return false;
    }
  };

  return {
    products,
    categories,
    loading,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    updateStock,
    createCategory,
  };
}
