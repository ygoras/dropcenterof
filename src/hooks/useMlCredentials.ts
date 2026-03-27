import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface MlCredential {
  id: string;
  tenant_id: string;
  ml_user_id: string;
  ml_nickname: string | null;
  store_name: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export function useMlCredentials() {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<MlCredential[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCredentials = useCallback(async () => {
    try {
      const data = await api.get<MlCredential[]>("/api/ml/credentials");
      setCredentials(data);
    } catch {
      setCredentials([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Listen for postMessage from OAuth popup to auto-refresh
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "ML_OAUTH_SUCCESS") {
        setTimeout(() => fetchCredentials(), 1500);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchCredentials]);

  // Poll for credential changes when OAuth popup is open
  const startPolling = useCallback(() => {
    const currentCount = credentials.length;
    const interval = setInterval(async () => {
      try {
        const data = await api.get<MlCredential[]>("/api/ml/credentials");
        if (data.length > currentCount) {
          clearInterval(interval);
          setCredentials(data);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    setTimeout(() => clearInterval(interval), 120000);
    return interval;
  }, [credentials.length]);

  const startOAuth = async () => {
    if (!user?.id) return;

    const appUrl = window.location.origin;
    const data = await api.post<{ auth_url: string }>("/api/ml/oauth", {
      tenant_id: user.tenant_id,
      user_id: user.id,
      app_url: appUrl,
    });

    if (data?.auth_url) {
      window.open(data.auth_url, "_blank", "width=600,height=700");
      startPolling();
    }
  };

  const disconnect = async (credentialId: string) => {
    const cred = credentials.find((c) => c.id === credentialId);
    if (!cred) return { error: new Error("Credential not found") };

    try {
      await api.post("/api/ml/disconnect", { ml_user_id: cred.ml_user_id });
      await fetchCredentials();
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  const updateStoreName = async (credentialId: string, storeName: string) => {
    try {
      await api.patch(`/api/ml/credentials/${credentialId}`, { store_name: storeName });
      toast.success("Nome da loja atualizado!");
      await fetchCredentials();
      return true;
    } catch {
      toast.error("Erro ao atualizar nome da loja");
      return false;
    }
  };

  // Backward compatibility: first credential
  const credential = credentials[0] ?? null;
  const isExpired = credential ? new Date(credential.expires_at) < new Date() : false;
  const isConnected = credentials.length > 0 && credentials.some((c) => new Date(c.expires_at) > new Date());

  return {
    credential,
    credentials,
    loading,
    isConnected,
    isExpired,
    startOAuth,
    disconnect,
    updateStoreName,
    refetch: fetchCredentials,
  };
}
