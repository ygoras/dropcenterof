import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import type { Plan } from "@/types/database";

export function useManagePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Plan[]>("/api/admin/plans");
      setPlans(data);
    } catch (err: any) {
      toast({ title: "Erro ao carregar planos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const createPlan = async (data: {
    name: string;
    slug: string;
    price: number;
    description?: string;
    max_listings?: number;
    max_stores?: number;
    features?: string[];
  }) => {
    try {
      await api.post("/api/admin/plans", {
        name: data.name,
        slug: data.slug,
        price: data.price,
        description: data.description || null,
        max_listings: data.max_listings || null,
        max_stores: data.max_stores || 1,
        features: data.features || [],
        is_active: true,
      });
      toast({ title: "Plano criado com sucesso!" });
      await fetchPlans();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao criar plano", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const updatePlan = async (id: string, data: {
    name?: string;
    price?: number;
    description?: string;
    max_listings?: number | null;
    max_stores?: number;
    features?: string[];
    is_active?: boolean;
  }) => {
    try {
      await api.patch(`/api/admin/plans/${id}`, data);
      toast({ title: "Plano atualizado!" });
      await fetchPlans();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao atualizar plano", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const togglePlanActive = async (id: string, currentActive: boolean) => {
    try {
      await api.patch(`/api/admin/plans/${id}`, { is_active: !currentActive });
      toast({ title: currentActive ? "Plano desativado" : "Plano ativado" });
      await fetchPlans();
    } catch (err: any) {
      toast({ title: "Erro ao alterar status", description: err.message, variant: "destructive" });
    }
  };

  return { plans, loading, fetchPlans, createPlan, updatePlan, togglePlanActive };
}
