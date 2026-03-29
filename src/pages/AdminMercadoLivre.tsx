import { useState, useEffect, useMemo } from "react";
import { formatCurrency, formatDateTime as formatDate } from "@/lib/formatters";
import {
  Store,
  ClipboardList,
  Users,
  CheckCircle2,
  AlertTriangle,
  Unlink,
  ExternalLink,
  RefreshCw,
  Search,
  Package,
  FileText,
  ShoppingCart,
} from "lucide-react";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SellerIntegration {
  tenant_id: string;
  tenant_name: string;
  seller_name: string;
  seller_email: string;
  ml_nickname: string | null;
  ml_user_id: string | null;
  connected: boolean;
  expires_at: string | null;
  is_expired: boolean;
  listing_count: number;
  active_listings: number;
  draft_listings: number;
  error_listings: number;
}

interface AdminListing {
  id: string;
  title: string;
  price: number;
  status: string;
  sync_status: string;
  ml_item_id: string | null;
  category_id: string | null;
  last_sync_at: string | null;
  created_at: string;
  tenant_name: string;
  seller_name: string;
  product_name: string;
  product_sku: string;
  product_images: string[];
  product_id: string;
}

interface SyncLogEntry {
  id: string;
  listing_title: string;
  ml_item_id: string | null;
  seller_name: string;
  tenant_name: string;
  sync_status: string;
  last_sync_at: string | null;
  updated_at: string;
}

interface MLProfile {
  id: string;
  name: string;
  email: string;
  tenant_id: string | null;
}

interface MLCredential {
  tenant_id: string;
  ml_nickname: string | null;
  ml_user_id: string | null;
  expires_at: string;
}

interface MLListingRow {
  id: string;
  title: string;
  price: number;
  status: string;
  sync_status: string;
  ml_item_id: string | null;
  category_id: string | null;
  last_sync_at: string | null;
  created_at: string;
  tenant_id: string;
  product_id: string;
  products?: { name: string; sku: string; images: string[] } | null;
}

interface MLTenantRow {
  id: string;
  name: string;
}

interface MLSellerRole {
  user_id: string;
  role: string;
}

interface MLOrderRow {
  id: string;
  items: Array<{ product_id: string; quantity: number }>;
}

interface AdminOverviewResponse {
  profiles: MLProfile[];
  credentials: MLCredential[];
  listings: MLListingRow[];
  tenants: MLTenantRow[];
  sellerRoles: MLSellerRole[];
  orders: MLOrderRow[];
}

const AdminMercadoLivre = () => {
  const [sellers, setSellers] = useState<SellerIntegration[]>([]);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [salesByProduct, setSalesByProduct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchSellers, setSearchSellers] = useState("");
  const [searchListings, setSearchListings] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Use API route (replaces Edge Function) to bypass tenant-scoped RLS
    let overview: AdminOverviewResponse | null;
    try {
      overview = await api.get<AdminOverviewResponse>("/api/ml/admin/overview");
    } catch (fnError: unknown) {
      const message = fnError instanceof Error ? fnError.message : "Erro desconhecido";
      console.error("Erro ao carregar dados admin ML:", fnError);
      toast({ title: "Erro", description: message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!overview) {
      setLoading(false);
      return;
    }

    const profiles: MLProfile[] = overview.profiles || [];
    const credentials: MLCredential[] = overview.credentials || [];
    const allListings: MLListingRow[] = overview.listings || [];
    const tenants: MLTenantRow[] = overview.tenants || [];
    const sellerRoles: MLSellerRole[] = overview.sellerRoles || [];
    const allOrders: MLOrderRow[] = overview.orders || [];

    // Build sales counts per product
    const salesCounts: Record<string, number> = {};
    allOrders.forEach((order) => {
      const items = order.items;
      items?.forEach((item) => {
        salesCounts[item.product_id] = (salesCounts[item.product_id] || 0) + item.quantity;
      });
    });
    setSalesByProduct(salesCounts);

    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));
    const credMap = Object.fromEntries(credentials.map((c) => [c.tenant_id, c]));

    // Build seller integration data
    const sellerUserIds = new Set(sellerRoles.map((r) => r.user_id));
    const sellerProfiles = profiles.filter((p) => sellerUserIds.has(p.id) && p.tenant_id);

    const sellerData: SellerIntegration[] = sellerProfiles.map((profile) => {
      const cred = credMap[profile.tenant_id!];
      const tenantListings = allListings.filter((l) => l.tenant_id === profile.tenant_id);

      return {
        tenant_id: profile.tenant_id!,
        tenant_name: tenantMap[profile.tenant_id!] || "—",
        seller_name: profile.name,
        seller_email: profile.email,
        ml_nickname: cred?.ml_nickname || null,
        ml_user_id: cred?.ml_user_id || null,
        connected: !!cred,
        expires_at: cred?.expires_at || null,
        is_expired: cred ? new Date(cred.expires_at) < new Date() : false,
        listing_count: tenantListings.length,
        active_listings: tenantListings.filter((l) => l.status === "active").length,
        draft_listings: tenantListings.filter((l) => l.status === "draft").length,
        error_listings: tenantListings.filter((l) => l.sync_status === "error").length,
      };
    });

    setSellers(sellerData);

    // Build listings data
    const listingData: AdminListing[] = allListings.map((l) => {
      const sellerProfile = profiles.find((p) => p.tenant_id === l.tenant_id);
      return {
        id: l.id,
        title: l.title,
        price: l.price,
        status: l.status,
        sync_status: l.sync_status,
        ml_item_id: l.ml_item_id,
        category_id: l.category_id,
        last_sync_at: l.last_sync_at,
        created_at: l.created_at,
        tenant_name: tenantMap[l.tenant_id] || "—",
        seller_name: sellerProfile?.name || "—",
        product_name: l.products?.name || "—",
        product_sku: l.products?.sku || "—",
        product_images: l.products?.images || [],
        product_id: l.product_id,
      };
    });

    setListings(listingData);
    setLoading(false);
  };


  const filteredSellers = useMemo(() => sellers.filter(
    (s) =>
      s.seller_name.toLowerCase().includes(searchSellers.toLowerCase()) ||
      s.tenant_name.toLowerCase().includes(searchSellers.toLowerCase()) ||
      (s.ml_nickname ?? "").toLowerCase().includes(searchSellers.toLowerCase())
  ), [sellers, searchSellers]);

  const filteredListings = useMemo(() => listings.filter((l) => {
    const matchSearch =
      l.title.toLowerCase().includes(searchListings.toLowerCase()) ||
      l.seller_name.toLowerCase().includes(searchListings.toLowerCase()) ||
      l.product_name.toLowerCase().includes(searchListings.toLowerCase()) ||
      (l.ml_item_id ?? "").toLowerCase().includes(searchListings.toLowerCase());
    const matchStatus =
      statusFilter === "all" || l.status === statusFilter || l.sync_status === statusFilter;
    return matchSearch && matchStatus;
  }), [listings, searchListings, statusFilter]);

  // Stats
  const totalSellers = sellers.length;
  const connectedSellers = sellers.filter((s) => s.connected && !s.is_expired).length;
  const expiredSellers = sellers.filter((s) => s.is_expired).length;
  const totalListings = listings.length;
  const activeListings = listings.filter((l) => l.status === "active").length;
  const errorListings = listings.filter((l) => l.sync_status === "error").length;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
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
            <Store className="w-6 h-6 text-primary" />
            Mercado Livre — Visão Admin
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento consolidado de integrações e anúncios de todos os vendedores
          </p>
        </div>
        <button
          onClick={fetchData}
          className="h-10 px-5 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors self-start"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-4 h-4" />
            <span className="text-[10px] font-medium">Vendedores</span>
          </div>
          <p className="font-display text-xl font-bold text-foreground">{totalSellers}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-success mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px] font-medium">Conectados</span>
          </div>
          <p className="font-display text-xl font-bold text-success">{connectedSellers}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-warning mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[10px] font-medium">Token Expirado</span>
          </div>
          <p className="font-display text-xl font-bold text-warning">{expiredSellers}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ClipboardList className="w-4 h-4" />
            <span className="text-[10px] font-medium">Total Anúncios</span>
          </div>
          <p className="font-display text-xl font-bold text-foreground">{totalListings}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-success mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px] font-medium">Anúncios Ativos</span>
          </div>
          <p className="font-display text-xl font-bold text-success">{activeListings}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[10px] font-medium">Com Erros</span>
          </div>
          <p className="font-display text-xl font-bold text-destructive">{errorListings}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sellers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sellers" className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            Integrações ({totalSellers})
          </TabsTrigger>
          <TabsTrigger value="listings" className="flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" />
            Anúncios ({totalListings})
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Logs de Sincronização
          </TabsTrigger>
        </TabsList>

        {/* Sellers Tab */}
        <TabsContent value="sellers" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchSellers}
              onChange={(e) => setSearchSellers(e.target.value)}
              placeholder="Buscar vendedor, tenant ou nickname ML..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          {filteredSellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhum vendedor encontrado</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vendedor</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Tenant</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Status ML</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Conta ML</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Token</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Anúncios</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Ativos</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSellers.map((seller) => (
                      <tr key={seller.tenant_id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{seller.seller_name}</p>
                          <p className="text-[10px] text-muted-foreground">{seller.seller_email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground">{seller.tenant_name}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {seller.connected && !seller.is_expired ? (
                            <StatusBadge status="active" label="Conectado" />
                          ) : seller.is_expired ? (
                            <StatusBadge status="expired" label="Expirado" />
                          ) : (
                            <StatusBadge status="cancelled" label="Desconectado" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {seller.ml_nickname ? (
                            <p className="text-sm text-foreground">{seller.ml_nickname}</p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {seller.expires_at ? (
                            <span className={`text-xs ${seller.is_expired ? "text-destructive" : "text-muted-foreground"}`}>
                              {formatDate(seller.expires_at)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-foreground">{seller.listing_count}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-success">{seller.active_listings}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {seller.error_listings > 0 ? (
                            <span className="text-sm font-semibold text-destructive">{seller.error_listings}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Listings Tab */}
        <TabsContent value="listings" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchListings}
                onChange={(e) => setSearchListings(e.target.value)}
                placeholder="Buscar por título, vendedor, produto ou ID ML..."
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="draft">Rascunhos</option>
              <option value="paused">Pausados</option>
              <option value="synced">Sincronizados</option>
              <option value="pending">Pendentes</option>
              <option value="error">Com erro</option>
            </select>
          </div>

          {filteredListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhum anúncio encontrado</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Produto</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Título ML</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vendedor</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Preço</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Vendas</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Sinc.</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">ID ML</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Última Sinc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredListings.map((listing) => (
                      <tr key={listing.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {listing.product_images.length > 0 ? (
                              <img
                                src={listing.product_images[0]}
                                alt=""
                                className="w-8 h-8 rounded object-cover border border-border"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-secondary/50 flex items-center justify-center">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-foreground line-clamp-1">{listing.product_name}</p>
                              <p className="text-[10px] text-muted-foreground">{listing.product_sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground line-clamp-1 max-w-[200px]">{listing.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground">{listing.seller_name}</p>
                          <p className="text-[10px] text-muted-foreground">{listing.tenant_name}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(listing.price)}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-foreground">
                            {salesByProduct[listing.product_id] || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={listing.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge
                            status={listing.sync_status}
                            label={
                              listing.sync_status === "synced"
                                ? "Sincronizado"
                                : listing.sync_status === "pending"
                                ? "Pendente"
                                : listing.sync_status === "error"
                                ? "Erro"
                                : listing.sync_status
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {listing.ml_item_id ? (
                            <a
                              href={`https://www.mercadolivre.com.br/p/${listing.ml_item_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {listing.ml_item_id}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {listing.last_sync_at ? (
                            <span className="text-xs text-muted-foreground">{formatDate(listing.last_sync_at)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Sync Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          {(() => {
            // Build sync log entries from listings that have sync data
            const syncLogs: SyncLogEntry[] = listings
              .filter((l) => l.last_sync_at || l.sync_status === "error")
              .sort((a, b) => {
                const dateA = a.last_sync_at || a.created_at;
                const dateB = b.last_sync_at || b.created_at;
                return new Date(dateB).getTime() - new Date(dateA).getTime();
              })
              .map((l) => ({
                id: l.id,
                listing_title: l.title,
                ml_item_id: l.ml_item_id,
                seller_name: l.seller_name,
                tenant_name: l.tenant_name,
                sync_status: l.sync_status,
                last_sync_at: l.last_sync_at,
                updated_at: l.created_at,
              }));

            if (syncLogs.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mb-3 opacity-40" />
                  <p className="font-medium">Nenhum log de sincronização</p>
                  <p className="text-sm mt-1">Os logs aparecerão aqui quando anúncios forem sincronizados com o ML</p>
                </div>
              );
            }

            return (
              <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Anúncio</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vendedor</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">ID ML</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Status Sinc.</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Última Sinc.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncLogs.map((log) => (
                        <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-foreground line-clamp-1">{log.listing_title}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground">{log.seller_name}</p>
                            <p className="text-[10px] text-muted-foreground">{log.tenant_name}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {log.ml_item_id ? (
                              <a
                                href={`https://www.mercadolivre.com.br/p/${log.ml_item_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {log.ml_item_id}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge
                              status={log.sync_status}
                              label={
                                log.sync_status === "synced"
                                  ? "Sincronizado"
                                  : log.sync_status === "pending"
                                  ? "Pendente"
                                  : log.sync_status === "error"
                                  ? "Erro"
                                  : log.sync_status
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {log.last_sync_at ? (
                              <span className="text-xs text-muted-foreground">{formatDate(log.last_sync_at)}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Nunca</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminMercadoLivre;
