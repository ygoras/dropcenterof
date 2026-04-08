import { useEffect, useState, useMemo, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";
import { getMlStatusLabel } from "@/lib/mlStatusLabels";
import {
  ShoppingCart,
  Package,
  Users,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Boxes,
  Truck,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import { useOrders } from "@/hooks/useOrders";
import { useProducts } from "@/hooks/useProducts";
import { useSellers } from "@/hooks/useSellers";
import { useNavigate } from "react-router-dom";
import { useSSE } from "@/hooks/useSSE";

interface PickingMetrics {
  avgTimeAll: number | null;
  avgTimeToday: number | null;
  totalAll: number;
  totalToday: number;
}

const orderStatusConfig: Record<string, { label: string; badgeStatus: string }> = {
  pending: { label: "Pendente", badgeStatus: "pending" },
  approved: { label: "Aprovado", badgeStatus: "approved" },
  picking: { label: "Separando", badgeStatus: "picking" },
  packing: { label: "Embalando", badgeStatus: "packing" },
  packed: { label: "Aguardando Retirada", badgeStatus: "packed" },
  labeled: { label: "Etiquetado", badgeStatus: "labeled" },
  invoiced: { label: "Faturado", badgeStatus: "active" },
  shipped: { label: "Enviado", badgeStatus: "shipped" },
  delivered: { label: "Entregue", badgeStatus: "delivered" },
  cancelled: { label: "Cancelado", badgeStatus: "cancelled" },
};

const Dashboard = () => {
  const { profile } = useProfile();
  const { orders } = useOrders();
  const { products } = useProducts();
  const { sellers } = useSellers();
  const navigate = useNavigate();
  const [pickingMetrics, setPickingMetrics] = useState<PickingMetrics>({
    avgTimeAll: null,
    avgTimeToday: null,
    totalAll: 0,
    totalToday: 0,
  });

  // Today's date range
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  // Orders today
  const ordersToday = useMemo(
    () => orders.filter((o) => new Date(o.created_at) >= new Date(todayStart)),
    [orders, todayStart]
  );

  // Pipeline counts
  const pipeline = useMemo(() => ({
    pending: orders.filter((o) => o.status === "pending").length,
    picking: orders.filter((o) => ["approved", "picking"].includes(o.status)).length,
    packing: orders.filter((o) => ["packing", "packed"].includes(o.status)).length,
    shipping: orders.filter((o) => ["labeled", "invoiced", "shipped"].includes(o.status)).length,
  }), [orders]);

  // Recent orders (last 5)
  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  // Stock alerts
  const lowStockProducts = useMemo(
    () => products.filter((p) => p.status === "active" && p.low_stock),
    [products]
  );
  const outOfStockProducts = useMemo(
    () => products.filter((p) => p.status === "active" && p.stock_available <= 0),
    [products]
  );

  // Dynamic alerts
  const alerts = useMemo(() => {
    const list: { type: "error" | "warning"; message: string }[] = [];

    outOfStockProducts.forEach((p) => {
      list.push({
        type: "error",
        message: `SKU ${p.sku} — "${p.name}" sem estoque. Anúncios podem ser pausados automaticamente.`,
      });
    });

    lowStockProducts
      .filter((p) => p.stock_available > 0)
      .forEach((p) => {
        list.push({
          type: "warning",
          message: `SKU ${p.sku} — Estoque baixo (${p.stock_available} un., mín: ${p.stock_min}).`,
        });
      });

    const pendingCount = orders.filter((o) => o.status === "pending").length;
    if (pendingCount > 0) {
      list.push({
        type: "warning",
        message: `${pendingCount} pedido${pendingCount > 1 ? "s" : ""} pendente${pendingCount > 1 ? "s" : ""} aguardando aprovação.`,
      });
    }

    const packedCount = orders.filter((o) => o.status === "packed").length;
    if (packedCount > 0) {
      list.push({
        type: "warning",
        message: `${packedCount} pedido${packedCount > 1 ? "s" : ""} aguardando retirada no galpão.`,
      });
    }

    if (list.length === 0) {
      list.push({ type: "warning", message: "Nenhum alerta no momento. Operação funcionando normalmente." });
    }

    return list.slice(0, 5);
  }, [outOfStockProducts, lowStockProducts, orders]);

  // Fetch picking metrics (all time + today)
  const fetchPickingMetrics = useCallback(async () => {
    try {
      const data = await api.get<{ started_at: string | null; finished_at: string | null; created_at: string }[]>(
        "/api/picking-tasks?finished=true"
      );

      if (!data) return;

      const calcAvg = (tasks: typeof data) => {
        const valid = tasks.filter((t) => t.started_at && t.finished_at);
        if (valid.length === 0) return null;
        const totalMin = valid.reduce((acc, t) => {
          return acc + (new Date(t.finished_at!).getTime() - new Date(t.started_at!).getTime()) / 60000;
        }, 0);
        return Math.round(totalMin / valid.length);
      };

      const allCompleted = data.filter((t) => t.started_at && t.finished_at);
      const todayCompleted = allCompleted.filter((t) => new Date(t.created_at) >= new Date(todayStart));

      setPickingMetrics({
        avgTimeAll: calcAvg(allCompleted),
        avgTimeToday: calcAvg(todayCompleted),
        totalAll: allCompleted.length,
        totalToday: todayCompleted.length,
      });
    } catch (err) {
      console.error("Error fetching picking metrics:", err);
    }
  }, [todayStart]);

  useEffect(() => {
    fetchPickingMetrics();
  }, [fetchPickingMetrics]);

  // Realtime: auto-refresh picking metrics when orders or picking tasks change
  useSSE(["orders", "picking_tasks"], () => {
    fetchPickingMetrics();
  });

  const activeSellers = sellers.filter((s) => s.is_active).length;


  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {profile ? `Olá, ${profile.name}` : "Cockpit da Operação"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Visão em tempo real da sua operação de fulfillment</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pedidos Hoje"
          value={ordersToday.length.toString()}
          change={ordersToday.length > 0 ? `${formatCurrency(ordersToday.reduce((a, o) => a + o.total, 0))} em vendas` : "Nenhum pedido hoje"}
          changeType={ordersToday.length > 0 ? "positive" : "neutral"}
          icon={<ShoppingCart className="w-5 h-5" />}
        />
        <StatCard
          title="Produtos Cadastrados"
          value={products.length.toLocaleString("pt-BR")}
          change={lowStockProducts.length > 0 ? `${lowStockProducts.length} com estoque baixo` : "Estoque OK"}
          changeType={lowStockProducts.length > 0 ? "negative" : "positive"}
          icon={<Package className="w-5 h-5" />}
        />
        <StatCard
          title="Vendedores Ativos"
          value={activeSellers.toLocaleString("pt-BR")}
          change={`${sellers.length} total cadastrado${sellers.length !== 1 ? "s" : ""}`}
          changeType="neutral"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="Total de Pedidos"
          value={orders.length.toLocaleString("pt-BR")}
          change={`${orders.filter((o) => o.status === "delivered").length} entregues`}
          changeType="positive"
          icon={<Wallet className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-foreground">Pipeline de Pedidos</h3>
            <button
              onClick={() => navigate("/pedidos")}
              className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
            >
              Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Pipeline stages */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Pendentes", count: pipeline.pending, icon: Clock, color: "text-warning" },
              { label: "Em separação", count: pipeline.picking, icon: Boxes, color: "text-info" },
              { label: "Em packing", count: pipeline.packing, icon: Package, color: "text-primary" },
              { label: "Expedição", count: pipeline.shipping, icon: Truck, color: "text-success" },
            ].map((stage) => (
              <div key={stage.label} className="bg-secondary/50 rounded-lg p-3 text-center">
                <stage.icon className={`w-5 h-5 mx-auto mb-1 ${stage.color}`} />
                <p className="font-display text-xl font-bold text-foreground">{stage.count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stage.label}</p>
              </div>
            ))}
          </div>

          {/* Recent orders table */}
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ShoppingCart className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhum pedido registrado ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Pedido</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Vendedor</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Itens</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Status ML</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const config = orderStatusConfig[order.status] ?? orderStatusConfig.pending;
                    return (
                      <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 font-mono font-medium text-foreground">#{order.order_number}</td>
                        <td className="py-3 text-muted-foreground">{order.tenant_name || "—"}</td>
                        <td className="py-3 text-muted-foreground">{order.items?.length ?? 0}</td>
                        <td className="py-3">
                          <StatusBadge status={config.badgeStatus} label={config.label} />
                        </td>
                        <td className="py-3">
                          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                            {getMlStatusLabel(order.ml_status)}
                          </span>
                        </td>
                        <td className="py-3 text-right font-medium text-foreground">{formatCurrency(order.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alerts + Performance */}
        <div className="space-y-4">
          {/* Alerts */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-card">
            <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Alertas ({alerts.filter((a) => a.type === "error").length > 0 ? "Críticos" : "Info"})
            </h3>
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-xs font-medium leading-relaxed ${
                    alert.type === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {alert.message}
                </div>
              ))}
            </div>
          </div>

          {/* Performance */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-card">
            <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Performance Hoje
            </h3>
            <div className="space-y-3">
              {[
                {
                  label: "Tempo médio picking",
                  value: pickingMetrics.avgTimeToday !== null
                    ? `${pickingMetrics.avgTimeToday} min`
                    : pickingMetrics.avgTimeAll !== null
                      ? `${pickingMetrics.avgTimeAll} min (geral)`
                      : "Sem dados",
                },
                {
                  label: "Pedidos processados hoje",
                  value: pickingMetrics.totalToday > 0
                    ? pickingMetrics.totalToday.toString()
                    : `${pickingMetrics.totalAll} (total)`,
                },
                {
                  label: "Total processados",
                  value: pickingMetrics.totalAll.toString(),
                },
                {
                  label: "Pedidos em andamento",
                  value: orders.filter((o) => ["approved", "picking", "packing", "packed", "labeled", "invoiced", "shipped"].includes(o.status)).length.toString(),
                },
              ].map((metric) => (
                <div key={metric.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  <span className="text-sm font-semibold text-foreground">{metric.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
