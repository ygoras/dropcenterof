import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";

export interface WalletTransaction {
  id: string;
  tenant_id: string;
  type: "deposit" | "debit" | "refund";
  amount: number;
  balance_after: number | null;
  status: "pending" | "confirmed" | "failed" | "cancelled";
  description: string | null;
  reference_id: string | null;
  reference_type: string | null;
  metadata: Record<string, any>;
  created_at: string;
  confirmed_at: string | null;
}

export interface SpendingForecast {
  period_days: number;
  total_cost_30d: number;
  total_orders_30d: number;
  avg_daily_cost: number;
  avg_orders_per_day: number;
  weekly_forecast: number;
  monthly_forecast: number;
  current_balance: number;
  days_until_empty: number | null;
  pending_credit_orders: number;
}

export function useWallet() {
  const { profile } = useProfile();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [forecast, setForecast] = useState<SpendingForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.tenant_id) {
      setLoading(false);
      return;
    }

    try {
      const [balanceRes, txRes, forecastRes] = await Promise.all([
        api.post<{ balance?: number }>("/api/payments/pix", { action: "get_balance" }),
        api.post<{ transactions?: WalletTransaction[] }>("/api/payments/pix", { action: "get_transactions", limit: 50 }),
        api.post<SpendingForecast & { error?: string }>("/api/payments/pix", { action: "get_spending_forecast" }),
      ]);

      if (balanceRes) setBalance(balanceRes.balance ?? 0);
      if (txRes) setTransactions(txRes.transactions ?? []);
      if (forecastRes && !forecastRes.error) setForecast(forecastRes);
    } catch (err) {
      console.error("useWallet fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generatePix = async (amount: number) => {
    setGenerating(true);
    try {
      const data = await api.post("/api/payments/pix", { action: "generate_pix", amount });
      await fetchData();
      return data;
    } finally {
      setGenerating(false);
    }
  };

  const checkChargeStatus = async (referenceId: string) => {
    return api.post<{ status: string; balance: number }>("/api/payments/pix", {
      action: "check_charge_status",
      reference_id: referenceId,
    });
  };

  const cancelCharge = async (referenceId: string) => {
    const data = await api.post("/api/payments/pix", { action: "cancel_charge", reference_id: referenceId });
    await fetchData();
    return data;
  };

  const reopenPix = async (referenceId: string) => {
    return api.post<{ pix_code: string; pix_qr_image: string; amount: number; reference_id: string }>(
      "/api/payments/pix",
      { action: "reopen_pix", reference_id: referenceId }
    );
  };

  return { balance, transactions, forecast, loading, generating, generatePix, cancelCharge, reopenPix, checkChargeStatus, refetch: fetchData };
}
