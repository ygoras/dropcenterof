import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { api } from "@/lib/apiClient";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string | null;
  roles: string[];
  subscription_status?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!api.isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const profile = await api.get<UserProfile>("/api/auth/me");
      setUser(profile);
    } catch {
      setUser(null);
      api.setTokens(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();

    // Listen for forced logout (token refresh failure)
    const handleLogout = () => {
      api.setTokens(null);
      setUser(null);
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      const result = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: UserProfile;
      }>("/api/auth/login", { email, password });

      api.setTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      setUser(result.user);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const result = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: UserProfile;
      }>("/api/auth/register", { email, password, fullName });

      api.setTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      setUser(result.user);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      const stored = localStorage.getItem("auth_tokens");
      const tokens = stored ? JSON.parse(stored) : null;
      if (tokens?.refreshToken) {
        await api.post("/api/auth/logout", { refreshToken: tokens.refreshToken }).catch(() => {});
      }
    } finally {
      api.setTokens(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
