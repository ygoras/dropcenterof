import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";

export interface AppNotification {
  id: string;
  tenant_id: string;
  type: "low_balance" | "order_blocked" | "payment_confirmed" | "orders_released" | "info";
  title: string;
  message: string;
  read: boolean;
  action_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<AppNotification[]>("/api/notifications");
      setNotifications(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // SSE realtime subscription
  useSSE(["notifications"], () => {
    fetchNotifications();
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    await api.patch(`/api/notifications/${id}`, { read: true });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    await api.post("/api/notifications/read-all");
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refetch: fetchNotifications };
}
