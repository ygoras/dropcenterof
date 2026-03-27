import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";
import { toast } from "@/hooks/use-toast";

export interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_name: string;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  status: string;
  items: Array<{ product_id: string; product_name: string; sku: string; quantity: number; unit_price: number }>;
  subtotal: number;
  shipping_cost: number;
  total: number;
  shipping_address: { street: string; city: string; state: string; zip: string } | null;
  tracking_code: string | null;
  notes: string | null;
  ml_order_id: string | null;
  ml_credential_id: string | null;
  created_at: string;
  updated_at: string;
  // Enriched fields (now returned by backend)
  tenant_name?: string;
  store_name?: string;
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!api.isAuthenticated()) return;

    setLoading(true);
    try {
      const data = await api.get<Order[]>("/api/orders");
      setOrders(data);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar pedidos",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime: auto-refresh when orders change via SSE
  useSSE(["orders"], () => {
    fetchOrders();
  });

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await api.patch(`/api/orders/${orderId}`, { status: newStatus });
      toast({ title: "Status atualizado!" });
      await fetchOrders();
      return true;
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar status",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
      return false;
    }
  };

  const updateTrackingCode = async (orderId: string, trackingCode: string) => {
    try {
      await api.patch(`/api/orders/${orderId}`, {
        tracking_code: trackingCode,
        status: "shipped",
      });
      toast({ title: "Codigo de rastreio salvo!" });
      await fetchOrders();
      return true;
    } catch (err: any) {
      toast({
        title: "Erro ao salvar rastreio",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
      return false;
    }
  };

  return { orders, loading, fetchOrders, updateOrderStatus, updateTrackingCode };
}
