import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import type { Profile } from "@/types/database";
import { toast } from "@/hooks/use-toast";

export interface SellerWithDetails extends Profile {
  tenant_name: string | null;
  roles: string[];
  plan_name: string | null;
  plan_price: number | null;
  subscription_status: string | null;
  billing_day: number | null;
  current_period_end: string | null;
}

export function useSellers() {
  const [sellers, setSellers] = useState<SellerWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSellers = useCallback(async () => {
    setLoading(true);

    try {
      const data = await api.get<SellerWithDetails[]>("/api/users/sellers");
      setSellers(data);
    } catch (err: any) {
      toast({ title: "Erro ao carregar vendedores", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  const createSeller = async (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    company_name: string;
    company_document?: string;
    plan_id: string;
  }) => {
    try {
      await api.post("/api/users/sellers", {
        email: data.email,
        password: data.password,
        name: data.name,
        phone: data.phone || null,
        company_name: data.company_name,
        company_document: data.company_document || null,
        plan_id: data.plan_id,
      });

      toast({ title: "Vendedor criado com sucesso!", description: `Empresa "${data.company_name}" criada com plano ativo.` });
      await fetchSellers();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao criar vendedor", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const updateSeller = async (
    id: string,
    data: {
      name: string;
      phone?: string;
      tenant_id?: string;
      is_active: boolean;
      company_name?: string;
      company_document?: string;
      plan_id?: string;
      billing_day?: number;
    }
  ) => {
    try {
      await api.patch(`/api/users/sellers/${id}`, data);

      toast({ title: "Vendedor atualizado!" });
      await fetchSellers();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const softDeleteSeller = async (id: string) => {
    try {
      await api.patch(`/api/users/sellers/${id}`, { is_active: false });

      toast({ title: "Vendedor excluído", description: "Os dados foram preservados para relatórios." });
      await fetchSellers();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  // TODO: Password reset not available in new auth system.
  // Implement when backend provides a /api/auth/reset-password endpoint.
  const sendPasswordReset = async (email: string) => {
    toast({ title: "Funcionalidade indisponível", description: "Redefinição de senha ainda não implementada no novo sistema.", variant: "destructive" });
    return false;
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await api.patch(`/api/users/sellers/${id}`, { is_active: !currentActive });

      toast({ title: currentActive ? "Vendedor desativado" : "Vendedor ativado" });
      await fetchSellers();
    } catch (err: any) {
      toast({ title: "Erro ao alterar status", description: err.message, variant: "destructive" });
    }
  };

  return { sellers, loading, fetchSellers, createSeller, updateSeller, toggleActive, softDeleteSeller, sendPasswordReset };
}
