import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";
import { toast } from "sonner";

export interface MlListing {
  id: string;
  product_id: string;
  tenant_id: string;
  ml_item_id: string | null;
  ml_credential_id: string | null;
  title: string;
  price: number;
  status: string;
  category_id: string | null;
  sync_status: string;
  last_sync_at: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined
  product_name?: string;
  product_sku?: string;
  product_images?: string[];
  store_name?: string;
}

export function useMlListings() {
  const [listings, setListings] = useState<MlListing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchListings = useCallback(async () => {
    try {
      const data = await api.get<MlListing[]>("/api/ml/listings");
      setListings(data);
    } catch {
      setListings([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // SSE subscription: auto-refresh when backend notifies listing changes
  useSSE(["ml_listings"], () => {
    fetchListings();
  });

  const createListing = async (listing: {
    product_id: string;
    title: string;
    description?: string;
    price: number;
    category_id?: string;
    attributes?: Record<string, unknown>;
    ml_credential_id?: string;
  }) => {
    try {
      const data = await api.post<MlListing>("/api/ml/listings", {
        ...listing,
        ml_credential_id: listing.ml_credential_id || null,
        status: "draft",
        sync_status: "pending",
      });
      toast.success("Anúncio criado com sucesso!");
      await fetchListings();
      return { data, error: null };
    } catch (err: any) {
      toast.error("Erro ao criar anúncio: " + (err.message || "Erro desconhecido"));
      return { data: null, error: err };
    }
  };

  const deleteListing = async (id: string) => {
    toast.info("Encerrando anúncio...");

    try {
      const data = await api.post<{ error?: string; ml_error?: string }>("/api/ml/sync", {
        action: "close",
        listing_id: id,
      });

      if (data?.error) {
        toast.error(data.error + (data.ml_error ? `: ${data.ml_error}` : ""));
        return;
      }

      toast.success("Anúncio encerrado e excluído!");
      await fetchListings();
    } catch (err: any) {
      toast.error("Erro ao encerrar anúncio: " + (err.message || "Erro desconhecido"));
    }
  };

  const updateListingPrice = async (listingId: string, newPrice: number, newListingTypeId?: string) => {
    // Build update payload
    const updateData: Record<string, unknown> = { price: newPrice };

    // If listing type changed, update attributes
    const listing = listings.find((l) => l.id === listingId);
    if (newListingTypeId && listing) {
      updateData.attributes = {
        ...(listing.attributes || {}),
        _listing_type_id: newListingTypeId,
      };
    }

    try {
      await api.patch(`/api/ml/listings/${listingId}`, updateData);
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + (err.message || "Erro desconhecido"));
      return { error: err };
    }

    // If published on ML, sync
    if (listing?.ml_item_id) {
      toast.info("Atualizando no Mercado Livre...");
      try {
        const data = await api.post<{ error?: string; ml_error?: string }>("/api/ml/sync", {
          action: "update",
          listing_id: listingId,
          listing_type_id: newListingTypeId,
        });

        if (data?.error) {
          toast.warning("Atualizado localmente, mas erro ao sincronizar com ML.");
        } else {
          toast.success("Atualizado no Mercado Livre!");
        }
      } catch {
        toast.warning("Atualizado localmente, mas erro ao sincronizar com ML.");
      }
    } else {
      toast.success("Atualizado!");
    }

    await fetchListings();
    return { success: true };
  };

  const syncListing = async (listingId: string, action: "publish" | "update" | "pause" | "activate") => {
    const actionLabels: Record<string, string> = {
      publish: "Publicando",
      update: "Atualizando",
      pause: "Pausando",
      activate: "Ativando",
    };

    toast.info(`${actionLabels[action]} anúncio...`);

    try {
      const data = await api.post<{ error?: string; ml_error?: string; permalink?: string }>("/api/ml/sync", {
        action,
        listing_id: listingId,
      });

      if (data?.error) {
        toast.error(data.error + (data.ml_error ? `: ${data.ml_error}` : ""));
        return { error: data };
      }

      const successLabels: Record<string, string> = {
        publish: "Anúncio publicado no ML!",
        update: "Anúncio atualizado!",
        pause: "Anúncio pausado!",
        activate: "Anúncio reativado!",
      };
      toast.success(successLabels[action]);
      if (data?.permalink) {
        toast.info(`Link: ${data.permalink}`);
      }
      await fetchListings();
      return { data };
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Erro desconhecido"));
      return { error: err };
    }
  };

  /**
   * Creates a listing and immediately publishes it to Mercado Livre.
   * Auto-predicts ML category from the product title.
   * All mandatory fields come from the product data (admin catalog).
   */
  const createAndPublish = async (params: {
    product_id: string;
    title: string;
    description?: string;
    price: number;
    listingType: string;
    freeShipping: boolean;
    condition: string;
    brand?: string;
    sku?: string;
    warranty_type?: string;
    warranty_time?: string;
    ml_category_id?: string;
  }) => {
    toast.info("Preparando anúncio...");

    // Step 1: Auto-predict ML category from title
    let categoryId = params.ml_category_id || null;
    if (!categoryId) {
      try {
        const result = await api.get<{ categories: { id: string }[] }>(
          `/api/ml/categories?action=search&q=${encodeURIComponent(params.title)}`
        );
        if (result?.categories?.length > 0) {
          categoryId = result.categories[0].id;
        }
      } catch (err) {
        console.warn("Could not auto-predict category:", err);
      }
    }

    // Step 2: Create listing with all product data
    const attributes: Record<string, unknown> = {
      _listing_type_id: params.listingType,
      _condition: params.condition || "new",
      _warranty_type: params.warranty_type || "Garantia do vendedor",
      _warranty_time: params.warranty_time || "90 dias",
      _free_shipping: params.freeShipping,
    };
    if (params.brand) attributes._brand = params.brand;
    if (params.sku) attributes._seller_sku = params.sku;

    let listing: MlListing;
    try {
      listing = await api.post<MlListing>("/api/ml/listings", {
        product_id: params.product_id,
        title: params.title,
        description: params.description || undefined,
        price: params.price,
        category_id: categoryId,
        attributes,
        status: "draft",
        sync_status: "pending",
      });
    } catch (err: any) {
      toast.error("Erro ao criar anúncio: " + (err.message || "Erro desconhecido"));
      return { error: err };
    }

    // Step 3: Immediately publish
    toast.info("Publicando no Mercado Livre...");

    try {
      const syncData = await api.post<{ error?: string; ml_error?: string; ml_details?: unknown; permalink?: string }>(
        "/api/ml/sync",
        { action: "publish", listing_id: listing.id }
      );

      if (syncData?.error) {
        toast.error(syncData.error + (syncData.ml_error ? `: ${syncData.ml_error}` : ""));
        if (syncData.ml_details) {
          console.error("ML publish details:", syncData.ml_details);
        }
        await fetchListings();
        return { error: syncData };
      }

      toast.success("Anúncio publicado no Mercado Livre!");
      if (syncData?.permalink) {
        toast.info(`Link: ${syncData.permalink}`, { duration: 10000 });
      }
      await fetchListings();
      return { data: syncData };
    } catch (err: any) {
      toast.error("Erro ao publicar: " + (err.message || "Erro desconhecido"));
      await fetchListings();
      return { error: err };
    }
  };

  const refreshListing = async (listingId: string) => {
    toast.info("Sincronizando dados do Mercado Livre...");

    try {
      const data = await api.post<{ error?: string; ml_error?: string }>("/api/ml/sync", {
        action: "refresh",
        listing_id: listingId,
      });

      if (data?.error) {
        toast.error(data.error + (data.ml_error ? `: ${data.ml_error}` : ""));
        return { error: data };
      }

      toast.success("Dados sincronizados do ML!");
      await fetchListings();
      return { data };
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err.message || "Erro desconhecido"));
      return { error: err };
    }
  };

  return { listings, loading, createListing, deleteListing, syncListing, createAndPublish, updateListingPrice, refreshListing, refetch: fetchListings };
}
