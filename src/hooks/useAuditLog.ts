import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/apiClient";

export interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export function useAuditLog(limit = 100) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AuditEntry[]>(`/api/audit?limit=${limit}`);
      setEntries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { entries, loading, refetch: fetchLogs };
}

export async function logAudit(action: string, entityType: string, entityId?: string, details?: Record<string, unknown>) {
  try {
    await api.post("/api/audit", {
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? {},
    });
  } catch {
    // Audit logging should not break the calling flow
  }
}
