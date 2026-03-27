import { useAuth } from "@/contexts/AuthContext";
import type { Profile } from "@/types/database";

export function useProfile() {
  const { user, loading } = useAuth();

  // Map the auth user to a Profile-like object for backward compatibility
  const profile: Profile | null = user
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
    : null;

  return { profile, loading };
}
