import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import { useRole } from "@/hooks/useRole";

export type DateRange = "7d" | "30d" | "90d" | "all";

export interface AnalyticsFilters {
  dateRange: DateRange;
  tenantId: string;
  categoryId: string;
}

export interface SalesBySellerRow {
  tenant_id: string;
  tenant_name: string;
  order_count: number;
  total_revenue: number;
  total_cost: number;
  total_shipping: number;
  total_fees: number;
  total_net: number;
  avg_ticket: number;
  items_sold: number;
}

export interface SalesBySkuRow {
  sku: string;
  product_name: string;
  quantity_sold: number;
  revenue: number;
  cost: number;
  shipping: number;
  fees: number;
  net: number;
  order_count: number;
}

export interface SalesByCategoryRow {
  category_id: string;
  category_name: string;
  quantity_sold: number;
  revenue: number;
  cost: number;
  net: number;
  product_count: number;
}

export interface ProductivityRow {
  date: string;
  packed_count: number;
  avg_time_seconds: number;
}

export interface OperatorProductivityRow {
  operator_id: string;
  operator_name: string;
  packed_count: number;
  avg_time_seconds: number;
  fastest_seconds: number;
  slowest_seconds: number;
}

export interface DailyTrendRow {
  date: string;
  revenue: number;
  orders: number;
  net: number;
}

export interface AnalyticsData {
  salesBySeller: SalesBySellerRow[];
  salesBySku: SalesBySkuRow[];
  salesByCategory: SalesByCategoryRow[];
  productivity: ProductivityRow[];
  operatorProductivity: OperatorProductivityRow[];
  dailyTrend: DailyTrendRow[];
  totals: {
    revenue: number;
    cost: number;
    shipping: number;
    fees: number;
    net: number;
    orders: number;
    itemsSold: number;
    avgTicket: number;
  };
}

interface AnalyticsFilterOptions {
  tenants: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

const DEFAULT_FILTERS: AnalyticsFilters = {
  dateRange: "30d",
  tenantId: "all",
  categoryId: "all",
};

export function useAnalytics(overrideFilters?: Partial<AnalyticsFilters>) {
  const { profile } = useProfile();
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const [filters, setFilters] = useState<AnalyticsFilters>({ ...DEFAULT_FILTERS, ...overrideFilters });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const isSeller = !isAdmin && !isManager;

  // Fetch filter options
  useEffect(() => {
    if (roleLoading) return;
    const fetchOptions = async () => {
      try {
        const opts = await api.get<AnalyticsFilterOptions>("/api/analytics/filters");
        setTenants(opts.tenants ?? []);
        setCategories(opts.categories ?? []);
      } catch {
        // ignore
      }
    };
    fetchOptions();
  }, [roleLoading]);

  const fetchData = useCallback(async () => {
    if (!profile?.tenant_id || roleLoading) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        dateRange: filters.dateRange,
        tenantId: filters.tenantId,
        categoryId: filters.categoryId,
      });
      const result = await api.get<AnalyticsData>(`/api/analytics?${params.toString()}`);
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [profile?.tenant_id, filters, roleLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, filters, setFilters, tenants, categories, isSeller };
}
