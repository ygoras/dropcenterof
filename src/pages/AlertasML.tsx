import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDateTime as formatDate } from "@/lib/formatters";
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Bell,
  Filter,
  ChevronDown,
  ExternalLink,
  Unlink,
} from "lucide-react";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

interface TokenAlert {
  tenant_id: string;
  tenant_name: string;
  seller_name: string;
  seller_email: string;
  ml_nickname: string | null;
  expires_at: string;
  hours_remaining: number;
  severity: "critical" | "warning" | "info";
}

interface SyncAlert {
  id: string;
  title: string;
  ml_item_id: string | null;
  product_name: string;
  product_sku: string;
  seller_name: string;
  tenant_name: string;
  sync_status: string;
  last_sync_at: string | null;
  created_at: string;
  error_detail: string | null;
}

interface AlertProfile {
  id: string;
  name: string;
  email: string;
  tenant_id: string | null;
}

interface AlertCredential {
  tenant_id: string;
  ml_nickname: string | null;
  expires_at: string;
}

interface AlertListingRow {
  id: string;
  title: string;
  ml_item_id: string | null;
  tenant_id: string;
  sync_status: string;
  last_sync_at: string | null;
  created_at: string;
  error_message?: string | null;
  products?: { name: string; sku: string } | null;
}

interface AlertTenantRow {
  id: string;
  name: string;
}

interface AlertRoleRow {
  user_id: string;
  role: string;
}

const AlertasML = () => {
  const [tokenAlerts, setTokenAlerts] = useState<TokenAlert[]>([]);
  const [syncAlerts, setSyncAlerts] = useState<SyncAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAlerts = useCallback(async () => {
    let profiles: AlertProfile[] = [];
    let credentials: AlertCredential[] = [];
    let errorListings: AlertListingRow[] = [];
    let tenants: AlertTenantRow[] = [];
    let sellerRoles: AlertRoleRow[] = [];

    try {
      const [profilesRes, credentialsRes, listingsRes, tenantsRes, rolesRes] = await Promise.all([
        api.get<AlertProfile[]>("/api/profiles"),
        api.get<AlertCredential[]>("/api/ml/credentials"),
        api.get<AlertListingRow[]>("/api/ml/listings?sync_status=error"),
        api.get<AlertTenantRow[]>("/api/tenants"),
        api.get<AlertRoleRow[]>("/api/user-roles?role=seller"),
      ]);

      profiles = profilesRes || [];
      credentials = credentialsRes || [];
      errorListings = listingsRes || [];
      tenants = tenantsRes || [];
      sellerRoles = rolesRes || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("Error fetching alerts data:", err);
      toast({ title: "Erro", description: message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));
    const sellerUserIds = new Set(sellerRoles.map((r) => r.user_id));

    // Token alerts
    const now = new Date();
    const tokens: TokenAlert[] = credentials
      .map((cred) => {
        const profile = profiles.find(
          (p) => p.tenant_id === cred.tenant_id && sellerUserIds.has(p.id)
        );
        const expiresAt = new Date(cred.expires_at);
        const hoursRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

        let severity: "critical" | "warning" | "info" = "info";
        if (hoursRemaining <= 0) severity = "critical";
        else if (hoursRemaining <= 24) severity = "warning";
        else return null;

        return {
          tenant_id: cred.tenant_id,
          tenant_name: tenantMap[cred.tenant_id] || "—",
          seller_name: profile?.name || "Desconhecido",
          seller_email: profile?.email || "",
          ml_nickname: cred.ml_nickname,
          expires_at: cred.expires_at,
          hours_remaining: hoursRemaining,
          severity,
        } as TokenAlert;
      })
      .filter(Boolean) as TokenAlert[];

    tokens.sort((a, b) => a.hours_remaining - b.hours_remaining);

    // Sync error alerts
    const syncErrors: SyncAlert[] = errorListings.map((l) => {
      const profile = profiles.find((p) => p.tenant_id === l.tenant_id);
      return {
        id: l.id,
        title: l.title,
        ml_item_id: l.ml_item_id,
        product_name: l.products?.name || "—",
        product_sku: l.products?.sku || "—",
        seller_name: profile?.name || "—",
        tenant_name: tenantMap[l.tenant_id] || "—",
        sync_status: l.sync_status,
        last_sync_at: l.last_sync_at,
        created_at: l.created_at,
        error_detail: l.error_message || null,
      };
    });

    setTokenAlerts(tokens);
    setSyncAlerts(syncErrors);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAlerts]);


  const formatTimeAgo = (hours: number) => {
    if (hours <= 0) {
      const absHours = Math.abs(hours);
      if (absHours < 1) return `Expirou há ${Math.round(absHours * 60)}min`;
      if (absHours < 24) return `Expirou há ${Math.round(absHours)}h`;
      return `Expirou há ${Math.round(absHours / 24)}d`;
    }
    if (hours < 1) return `Expira em ${Math.round(hours * 60)}min`;
    if (hours < 24) return `Expira em ${Math.round(hours)}h`;
    return `Expira em ${Math.round(hours / 24)}d`;
  };

  const filteredTokens = useMemo(() =>
    severityFilter === "all"
      ? tokenAlerts
      : tokenAlerts.filter((t) => t.severity === severityFilter),
    [tokenAlerts, severityFilter]
  );

  const criticalCount = useMemo(() => tokenAlerts.filter((t) => t.severity === "critical").length, [tokenAlerts]);
  const warningCount = useMemo(() => tokenAlerts.filter((t) => t.severity === "warning").length, [tokenAlerts]);
  const totalAlerts = tokenAlerts.length + syncAlerts.length;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-destructive" />
            Central de Alertas — Mercado Livre
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento em tempo real de tokens e erros de sincronização
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-input"
            />
            Auto-refresh (1min)
          </label>
          <button
            onClick={fetchAlerts}
            className="h-10 px-5 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Bell className="w-4 h-4" />
            <span className="text-[10px] font-medium">Total Alertas</span>
          </div>
          <p className="font-display text-xl font-bold text-foreground">{totalAlerts}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <XCircle className="w-4 h-4" />
            <span className="text-[10px] font-medium">Tokens Expirados</span>
          </div>
          <p className="font-display text-xl font-bold text-destructive">{criticalCount}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-warning mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[10px] font-medium">Tokens Expirando</span>
          </div>
          <p className="font-display text-xl font-bold text-warning">{warningCount}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <Unlink className="w-4 h-4" />
            <span className="text-[10px] font-medium">Erros de Sinc.</span>
          </div>
          <p className="font-display text-xl font-bold text-destructive">{syncAlerts.length}</p>
        </div>
      </div>

      {/* No alerts state */}
      {totalAlerts === 0 && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-8 flex flex-col items-center text-center">
          <CheckCircle2 className="w-12 h-12 text-success mb-3" />
          <h3 className="font-display text-lg font-semibold text-foreground">
            Tudo funcionando perfeitamente
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            Nenhum token expirado ou erro de sincronização detectado
          </p>
        </div>
      )}

      {/* Token Alerts */}
      {tokenAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5 text-warning" />
              Alertas de Token ({tokenAlerts.length})
            </h2>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as "all" | "critical" | "warning")}
                className="h-8 px-2 rounded-lg border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Todos</option>
                <option value="critical">Críticos</option>
                <option value="warning">Atenção</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {filteredTokens.map((alert) => (
              <div
                key={alert.tenant_id}
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
                  alert.severity === "critical"
                    ? "bg-destructive/5 border-destructive/30"
                    : "bg-warning/5 border-warning/30"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alert.severity === "critical"
                      ? "bg-destructive/10"
                      : "bg-warning/10"
                  }`}
                >
                  {alert.severity === "critical" ? (
                    <XCircle className="w-5 h-5 text-destructive" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">
                      {alert.seller_name}
                    </p>
                    <StatusBadge
                      status={alert.severity === "critical" ? "expired" : "overdue"}
                      label={alert.severity === "critical" ? "Expirado" : "Expirando"}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {alert.tenant_name}
                    {alert.ml_nickname && ` · ${alert.ml_nickname}`}
                    {` · ${alert.seller_email}`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className={`text-sm font-semibold ${
                      alert.severity === "critical" ? "text-destructive" : "text-warning"
                    }`}
                  >
                    {formatTimeAgo(alert.hours_remaining)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(alert.expires_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Error Alerts */}
      {syncAlerts.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <Unlink className="w-5 h-5 text-destructive" />
            Erros de Sincronização ({syncAlerts.length})
          </h2>

          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Anúncio</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vendedor</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Produto</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">ID ML</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Última Tent.</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {syncAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className="border-b border-border last:border-0 hover:bg-destructive/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground line-clamp-1 max-w-[200px]">
                          {alert.title}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground">{alert.seller_name}</p>
                        <p className="text-[10px] text-muted-foreground">{alert.tenant_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground">{alert.product_name}</p>
                        <p className="text-[10px] text-muted-foreground">{alert.product_sku}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {alert.ml_item_id ? (
                          <a
                            href={`https://www.mercadolivre.com.br/p/${alert.ml_item_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {alert.ml_item_id}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {alert.last_sync_at ? (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(alert.last_sync_at)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-destructive line-clamp-2 max-w-[250px]">
                          {alert.error_detail || "Erro desconhecido na sincronização"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertasML;
