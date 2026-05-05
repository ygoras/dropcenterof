import { Filter, Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnalyticsFilters, DateRange } from "@/hooks/useAnalytics";

interface ReportFiltersProps {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  tenants: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  showTenantFilter?: boolean;
}

export function ReportFilters({ filters, onChange, tenants, categories, showTenantFilter = true }: ReportFiltersProps) {
  const update = (patch: Partial<AnalyticsFilters>) => onChange({ ...filters, ...patch });

  // Defensive dedupe — even if backend returns duplicates, dropdown shows each tenant once
  const uniqueTenants = Array.from(new Map(tenants.map((t) => [t.id, t])).values());
  const uniqueCategories = Array.from(new Map(categories.map((c) => [c.id, c])).values());

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <Select value={filters.dateRange} onValueChange={(v) => update({ dateRange: v as DateRange })}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showTenantFilter && (
        <Select value={filters.tenantId} onValueChange={(v) => update({ tenantId: v })}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {uniqueTenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.categoryId} onValueChange={(v) => update({ categoryId: v })}>
        <SelectTrigger className="w-[180px] h-9 text-xs">
          <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas categorias</SelectItem>
          {uniqueCategories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
