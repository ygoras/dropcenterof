import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

export interface InternalUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  roles: string[];
}

export function useInternalUsers() {
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<InternalUser[]>("/api/admin/internal-users");
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const createUser = async (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: "admin" | "manager";
  }) => {
    try {
      await api.post("/api/admin/internal-users", {
        email: data.email,
        password: data.password,
        name: data.name,
        phone: data.phone || null,
        role: data.role,
      });
      toast({ title: "Usuário interno criado com sucesso!" });
      await fetchUsers();
      return true;
    } catch (err: any) {
      toast({
        title: "Erro ao criar usuário",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await api.patch(`/api/admin/internal-users/${id}`, { is_active: !currentActive });
      toast({ title: currentActive ? "Usuário desativado" : "Usuário ativado" });
      await fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao alterar status", description: err.message, variant: "destructive" });
    }
  };

  const updateUser = async (id: string, data: { name: string; phone?: string }) => {
    try {
      await api.patch(`/api/admin/internal-users/${id}`, { name: data.name, phone: data.phone || null });
      toast({ title: "Usuário atualizado!" });
      await fetchUsers();
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      await api.post("/api/auth/reset-password", { email });
      toast({ title: "E-mail de redefinição enviado!", description: `Enviado para ${email}` });
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao enviar reset", description: err.message, variant: "destructive" });
      return false;
    }
  };

  return { users, loading, createUser, toggleActive, updateUser, sendPasswordReset, refetch: fetchUsers };
}
