import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/types/database";

export function useRole() {
  const { user, loading } = useAuth();

  const roles = (user?.roles ?? []) as AppRole[];

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");
  const isManager = hasRole("manager") || isAdmin;
  const isSeller = hasRole("seller");

  return { roles, loading, hasRole, isAdmin, isManager, isSeller };
}
