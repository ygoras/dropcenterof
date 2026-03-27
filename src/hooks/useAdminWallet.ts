import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";

export interface SellerWalletInfo {
  tenant_id: string;
  tenant_name: string;
  seller_name: string;
  seller_email: string;
  balance: number;
  total_deposits: number;
  total_debits: number;
  last_transaction_at: string | null;
}

export interface PlatformFinancialSummary {
  total_balance: number;
  total_sellers: number;
  total_deposits_all: number;
  total_debits_all: number;
  avg_balance_per_seller: number;
  avg_spend_per_seller: number;
  sellers_with_zero: number;
  sellers_with_low: number;
}

interface AdminWalletResponse {
  sellers: SellerWalletInfo[];
  summary: PlatformFinancialSummary;
}

export function useAdminWallet() {
  const [sellers, setSellers] = useState<SellerWalletInfo[]>([]);
  const [summary, setSummary] = useState<PlatformFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AdminWalletResponse>("/api/admin/wallets");
      setSellers(data.sellers);
      setSummary(data.summary);
    } catch (err) {
      console.error("useAdminWallet error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { sellers, summary, loading, refetch: fetchData };
}
