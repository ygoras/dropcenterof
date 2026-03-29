import { useEffect, useState, useMemo } from "react";
import { Package, ShoppingCart, Wallet, TrendingUp, AlertTriangle, Clock, DollarSign } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/apiClient";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useProfile } from "@/hooks/useProfile";
import { Link } from "react-router-dom";
import type { AvailableStock, SubscriptionStatus, PaymentStatus } from "@/types/database";

interface StockItem {
  low_stock: boolean;
}

interface SubscriptionResponse {
  status: SubscriptionStatus;
  plan: { name: string; price: number } | null;
}

interface PaymentItem {
  id: string;
  amount: number;
  due_date: string;
  status: PaymentStatus;
}

interface OrderItem {
  id: string;
  status: string;
  total: number;
  created_at: string;
}

interface WalletBalanceResponse {
  balance: number;
}

interface SpendingForecastResponse {
  days_until_empty: number;
  error?: string;
}

interface SellerStats {
  totalProducts: number;
  activeListings: number;
  pendingOrders: number;
  pendingCreditOrders: number;
  monthlyRevenue: number;
  planName: string;
  planStatus: string;
  nextDueDate: string | null;
  nextDueAmount: number;
  lowStockCount: number;
}

const SellerDashboard = () => {
  const { profile } = useProfile();
  const [stats, setStats] = useState<SellerStats>({
    totalProducts: 0,
    activeListings: 0,
    pendingOrders: 0,
    pendingCreditOrders: 0,
    monthlyRevenue: 0,
    planName: "—",
    planStatus: "active",
    nextDueDate: null,
    nextDueAmount: 0,
    lowStockCount: 0,
  });
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [daysUntilEmpty, setDaysUntilEmpty] = useState<number | null>(null);
  const [recentPayments, setRecentPayments] = useState<Array<{
    id: string;
    amount: number;
    due_date: string;
    status: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.tenant_id) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      const tenantId = profile.tenant_id!;

      // Fetch all data in parallel
      // Get first day of current month for revenue calculation
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [productsRes, stockRes, subRes, paymentsRes, listingsRes, ordersRes] = await Promise.all([
        api.get<{ count: number }>(`/api/products?tenant_id=${tenantId}&status=active&count_only=true`),
        api.get<StockItem[]>(`/api/stock?tenant_id=${tenantId}`),
        api.get<SubscriptionResponse>(`/api/subscriptions?tenant_id=${tenantId}`),
        api.get<PaymentItem[]>(`/api/payments?tenant_id=${tenantId}&limit=5&order=due_date.desc`),
        api.get<{ count: number }>(`/api/ml-listings?tenant_id=${tenantId}&status=active&count_only=true`),
        api.get<OrderItem[]>(`/api/orders?tenant_id=${tenantId}&fields=status,total,created_at`),
      ]);

      const lowStockItems = (stockRes ?? []).filter((s) => s.low_stock);
      const nextPending = (paymentsRes ?? []).find((p) => p.status === "pending");
      const plan = subRes?.plan ?? null;

      // Calculate pending orders (all non-terminal statuses)
      const allOrders = ordersRes ?? [];
      const pendingOrders = allOrders.filter((o) =>
        ["pending", "pending_credit", "approved", "picking", "packing", "packed", "labeled", "invoiced", "shipped"].includes(o.status)
      ).length;
      const pendingCreditOrders = allOrders.filter((o) => o.status === "pending_credit").length;

      // Calculate monthly revenue from delivered/shipped orders this month
      const monthlyRevenue = allOrders
        .filter((o) =>
          !["cancelled", "returned"].includes(o.status) && o.created_at >= monthStart
        )
        .reduce((sum, o) => sum + (o.total || 0), 0);

      setStats({
        totalProducts: productsRes?.count ?? 0,
        activeListings: listingsRes?.count ?? 0,
        pendingOrders,
        pendingCreditOrders,
        monthlyRevenue,
        planName: plan?.name ?? "—",
        planStatus: subRes?.status ?? "active",
        nextDueDate: nextPending?.due_date ?? null,
        nextDueAmount: nextPending?.amount ?? 0,
        lowStockCount: lowStockItems.length,
      });

      setRecentPayments(
        (paymentsRes ?? []).map((p) => ({
          id: p.id,
          amount: p.amount,
          due_date: p.due_date,
          status: p.status,
        }))
      );

      // Fetch wallet info
      try {
        const balData = await api.post<WalletBalanceResponse>("/api/asaas-pix", { action: "get_balance" });
        if (balData) setWalletBalance(balData.balance ?? 0);
        const fcData = await api.post<SpendingForecastResponse>("/api/asaas-pix", { action: "get_spending_forecast" });
        if (fcData && !fcData.error) setDaysUntilEmpty(fcData.days_until_empty);
      } catch {}

      setLoading(false);
    };

    fetchStats();
  }, [profile?.tenant_id]);


  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Olá, {profile?.name?.split(" ")[0] ?? "Vendedor"} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Aqui está o resumo da sua operação
        </p>
      </div>

      {/* Plan status banner */}
      {stats.planStatus !== "active" && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {stats.planStatus === "overdue" && "Seu plano está com pagamento atrasado"}
              {stats.planStatus === "blocked" && "Sua conta está bloqueada por inadimplência"}
              {stats.planStatus === "cancelled" && "Seu plano foi cancelado"}
            </p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Entre em contato com o suporte para regularizar sua situação.
            </p>
          </div>
        </div>
      )}

      {/* Wallet low balance alert */}
      {daysUntilEmpty !== null && daysUntilEmpty <= 7 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-warning flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-warning">Saldo baixo na carteira!</p>
            <p className="text-xs text-warning/80 mt-0.5">
              Seu saldo de <strong>{walletBalance !== null ? formatCurrency(walletBalance) : "—"}</strong> dura aproximadamente{" "}
              <strong>{daysUntilEmpty} {daysUntilEmpty === 1 ? "dia" : "dias"}</strong>.
              {stats.pendingCreditOrders > 0 && (
                <> Você tem <strong>{stats.pendingCreditOrders} pedido(s)</strong> bloqueado(s) por crédito insuficiente.</>
              )}
            </p>
          </div>
          <Link
            to="/seller/credito"
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning text-warning-foreground text-xs font-medium hover:bg-warning/90 transition-colors"
          >
            Recarregar
          </Link>
        </div>
      )}

      {/* Pending Credit Orders alert */}
      {stats.pendingCreditOrders > 0 && (daysUntilEmpty === null || daysUntilEmpty > 7) && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {stats.pendingCreditOrders} pedido(s) aguardando crédito
            </p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Recarregue sua carteira para liberar esses pedidos na fila de separação.
            </p>
          </div>
          <Link
            to="/seller/credito"
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
          >
            Recarregar
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Produtos Disponíveis"
          value={stats.totalProducts}
          icon={<Package className="w-5 h-5" />}
        />
        <StatCard
          title="Anúncios Ativos"
          value={stats.activeListings}
          change={stats.activeListings > 0 ? "No Mercado Livre" : "Nenhum anúncio"}
          changeType={stats.activeListings > 0 ? "positive" : "neutral"}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="Pedidos em Andamento"
          value={stats.pendingOrders}
          change={stats.pendingOrders > 0 ? "No pipeline" : "Nenhum pendente"}
          changeType={stats.pendingOrders > 0 ? "negative" : "positive"}
          icon={<ShoppingCart className="w-5 h-5" />}
        />
        <StatCard
          title="Faturamento Mensal"
          value={formatCurrency(stats.monthlyRevenue)}
          change="Mês atual"
          changeType={stats.monthlyRevenue > 0 ? "positive" : "neutral"}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Estoque Baixo"
          value={stats.lowStockCount}
          change={stats.lowStockCount > 0 ? "Itens precisam de atenção" : "Tudo em ordem"}
          changeType={stats.lowStockCount > 0 ? "negative" : "positive"}
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Últimas Cobranças
          </h3>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança encontrada.</p>
          ) : (
            <div className="space-y-3">
              {recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {formatDate(p.due_date)}</p>
                  </div>
                  <StatusBadge status={p.status as "pending" | "confirmed" | "expired"} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            Resumo Rápido
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Plano</span>
              <span className="text-sm font-medium text-foreground">{stats.planName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={stats.planStatus as "active" | "overdue" | "blocked"} />
            </div>
            {stats.nextDueDate && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Próximo vencimento</span>
                <span className="text-sm font-medium text-foreground">{formatDate(stats.nextDueDate)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Produtos no catálogo</span>
              <span className="text-sm font-medium text-foreground">{stats.totalProducts}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Itens com estoque baixo</span>
              <span className={`text-sm font-medium ${stats.lowStockCount > 0 ? "text-destructive" : "text-success"}`}>
                {stats.lowStockCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellerDashboard;
