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

interface AuditResponse {
  data: AuditEntry[];
  total: number;
}

export function useAuditLog(pageSize = 20) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      let url = `/api/audit?limit=${pageSize}&offset=${offset}`;
      if (entityTypeFilter) url += `&entity_type=${entityTypeFilter}`;
      if (actionFilter) url += `&action=${actionFilter}`;

      const res = await api.get<AuditResponse>(url);
      setEntries(res?.data ?? []);
      setTotal(res?.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityTypeFilter, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when filters change
  const setEntityType = useCallback((v: string) => { setEntityTypeFilter(v); setPage(1); }, []);
  const setAction = useCallback((v: string) => { setActionFilter(v); setPage(1); }, []);

  return {
    entries, loading, total, page, setPage, totalPages,
    entityTypeFilter, setEntityTypeFilter: setEntityType,
    actionFilter, setActionFilter: setAction,
    refetch: fetchLogs,
  };
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
