import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useUser, useAuth as useClerkAuth, useClerk } from "@clerk/clerk-react";
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
  const { isSignedIn, isLoaded: clerkLoaded, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch app profile whenever Clerk auth state changes
  const fetchProfile = useCallback(async () => {
    if (!clerkLoaded) return;

    if (!isSignedIn) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      // Get Clerk session token for API calls
      const token = await getToken();
      if (token) {
        api.setClerkToken(token);
      }

      const profile = await api.get<UserProfile>("/api/auth/me");
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [clerkLoaded, isSignedIn, getToken]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Keep token fresh — Clerk rotates tokens automatically
  useEffect(() => {
    if (!isSignedIn) return;

    const interval = setInterval(async () => {
      const token = await getToken();
      if (token) api.setClerkToken(token);
    }, 50000); // Refresh every 50s (Clerk tokens expire in 60s)

    return () => clearInterval(interval);
  }, [isSignedIn, getToken]);

  const signIn = async (_email: string, _password: string) => {
    // Clerk handles sign-in via its own UI components (<SignIn />)
    // This is kept for backward compatibility but shouldn't be called directly
    return { error: new Error("Use Clerk SignIn component") };
  };

  const signUp = async (_email: string, _password: string, _fullName: string) => {
    // Clerk handles sign-up via its own UI components (<SignUp />)
    return { error: new Error("Use Clerk SignUp component") };
  };

  const signOut = async () => {
    await clerk.signOut();
    api.setClerkToken(null);
    setUser(null);
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
