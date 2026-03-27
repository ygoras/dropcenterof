import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

export interface Operator {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export function useOperators() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Operator[]>("/api/operators");
      setOperators(data);
    } catch {
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  const createOperator = async (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    try {
      await api.post("/api/operators", {
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone || null,
      });
      toast({ title: "Operador criado com sucesso" });
      fetchOperators();
    } catch (err: any) {
      toast({
        title: "Erro ao criar operador",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    try {
      await api.patch(`/api/operators/${id}`, { is_active: !currentlyActive });
      toast({
        title: currentlyActive ? "Operador desativado" : "Operador ativado",
      });
      fetchOperators();
    } catch (err: any) {
      toast({ title: "Erro ao alterar status", description: err.message, variant: "destructive" });
    }
  };

  const updateOperator = async (id: string, data: { name?: string; phone?: string }) => {
    try {
      await api.patch(`/api/operators/${id}`, data);
      toast({ title: "Operador atualizado com sucesso" });
      fetchOperators();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar operador", description: err.message, variant: "destructive" });
    }
  };

  const deleteOperator = async (id: string) => {
    try {
      await api.delete(`/api/operators/${id}`);
      toast({ title: "Operador removido com sucesso" });
      fetchOperators();
    } catch (err: any) {
      toast({ title: "Erro ao remover operador", description: err.message, variant: "destructive" });
    }
  };

  return { operators, loading, createOperator, toggleActive, updateOperator, deleteOperator, refetch: fetchOperators };
}
