import { useState, useEffect } from "react";
import { api } from "@/lib/apiClient";
import type { Tenant } from "@/types/database";

export function useTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.get<Tenant[]>("/api/tenants");
        setTenants(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const createTenant = async (data: { name: string; slug: string; document?: string }) => {
    try {
      await api.post("/api/tenants", data);
      const updated = await api.get<Tenant[]>("/api/tenants");
      setTenants(updated);
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  return { tenants, loading, createTenant };
}
