import { useState, useEffect } from "react";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import type { Plan } from "@/types/database";

interface SellerPlanInfo {
  plan: Plan | null;
  subscriptionStatus: string | null;
  activeListingsCount: number;
  maxListings: number | null;
  maxStores: number | null;
  connectedStores: number;
  canCreateListing: boolean;
  canConnectStore: boolean;
  remainingListings: number | null;
  remainingStores: number | null;
  isBlocked: boolean;
  loading: boolean;
}

interface SellerPlanResponse {
  plan: Plan | null;
  subscription_status: string | null;
  active_listings_count: number;
  max_stores: number | null;
  connected_stores: number;
}

export function useSellerPlan(): SellerPlanInfo {
  const { profile } = useProfile();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [activeListingsCount, setActiveListingsCount] = useState(0);
  const [connectedStores, setConnectedStores] = useState(0);
  const [maxStores, setMaxStores] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.tenant_id) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      try {
        const data = await api.get<SellerPlanResponse>("/api/seller/plan");
        setPlan(data.plan ?? null);
        setSubscriptionStatus(data.subscription_status ?? null);
        setActiveListingsCount(data.active_listings_count ?? 0);
        setConnectedStores(data.connected_stores ?? 0);
        setMaxStores(data.max_stores ?? 1);
      } catch {
        setPlan(null);
        setSubscriptionStatus(null);
        setMaxStores(1);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [profile?.tenant_id]);

  const maxListings = plan?.max_listings ?? null;
  const isBlocked = subscriptionStatus === "blocked";
  const canCreateListing = !isBlocked && (maxListings === null || activeListingsCount < maxListings);
  const remainingListings = maxListings !== null ? Math.max(0, maxListings - activeListingsCount) : null;
  const canConnectStore = !isBlocked && (maxStores === null || connectedStores < maxStores);
  const remainingStores = maxStores !== null ? Math.max(0, maxStores - connectedStores) : null;

  return {
    plan,
    subscriptionStatus,
    activeListingsCount,
    maxListings,
    maxStores,
    connectedStores,
    canCreateListing,
    canConnectStore,
    remainingListings,
    remainingStores,
    isBlocked,
    loading,
  };
}
