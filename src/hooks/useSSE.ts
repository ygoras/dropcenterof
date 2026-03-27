import { useEffect, useRef } from "react";
import { api } from "@/lib/apiClient";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface SSEEvent {
  type: string;
  table: string;
  operation: string;
  tenant_id: string;
}

export function useSSE(tables: string[], onEvent: (event: SSEEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const token = api.getAccessToken();
    if (!token) return;

    const url = `${API_BASE}/api/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        if (data.type === "connected") return;

        // Filter by tables of interest
        if (tables.length === 0 || tables.includes(data.table)) {
          callbackRef.current(data);
        }
      } catch {
        // Ignore parse errors (heartbeats, etc.)
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [tables.join(",")]); // Reconnect when tables change
}
