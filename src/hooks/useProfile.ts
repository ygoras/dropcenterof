import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Profile } from "@/types/database";

export function useProfile() {
  const { user, loading } = useAuth();

  // Memoize to avoid creating new object references on every render
  // (prevents useEffect re-runs in consuming components)
  const profile: Profile | null = useMemo(
    () =>
      user
        ? {
            id: user.id,
            tenant_id: user.tenant_id,
            name: user.full_name,
            email: user.email,
            phone: null,
            avatar_url: null,
            is_active: true,
            created_at: "",
            updated_at: "",
          }
        : null,
    [user]
  );

  return { profile, loading };
}
