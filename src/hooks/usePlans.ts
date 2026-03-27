import { useState, useEffect } from "react";
import { api } from "@/lib/apiClient";
import type { Plan } from "@/types/database";

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.get<Plan[]>("/api/plans");
        setPlans(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { plans, loading };
}
