import { useState, useEffect } from "react";
import { formatDateTime as formatDate } from "@/lib/formatters";
import { getMlStatusLabel } from "@/lib/mlStatusLabels";
import {
  Truck,
  Package,
  Clock,
  CheckCircle2,
  BarChart3,
  ArrowRight,
  Timer,
  Boxes,
  RefreshCw,
  Tag,
  User,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OrderRow {
  id: string;
  status: string;
  tenant_id: string;
  created_at: string;
  order_number: string;
  customer_name: string;
  items: OrderItemEntry[];
}

interface OrderItemEntry {
  product_id: string;
  quantity: number;
  sku?: string;
  name?: string;
}

interface PickingTask {
  id: string;
  order_id: string;
  operator_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface TenantRow {
  id: string;
  name: string;
}

interface ProfileRow {
  id: string;
  name: string;
  tenant_id: string | null;
}

interface ShipmentRow {
  id: string;
  shipped_at: string | null;
}

interface PickingTaskRow {
  id: string;
  order_id: string;
  operator_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  // joined
  order_number: string;
  order_status: string;
  ml_status: string | null;
  tenant_name: string;
  operator_name: string;
  item_count: number;
  customer_name: string;
}

const Logistica = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    awaitingPicking: 0,
    inPicking: 0,
    inPacking: 0,
    labeled: 0,
    shippedToday: 0,
    avgFulfillmentMin: 0,
  });
  const [tasks, setTasks] = useState<PickingTaskRow[]>([]);
  const [activeTab, setActiveTab] = useState("pipeline");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    let orders: OrderRow[] = [];
    let pickingTasks: PickingTask[] = [];
    let tenants: TenantRow[] = [];
    let profiles: ProfileRow[] = [];
    let shipments: ShipmentRow[] = [];

    try {
      const [ordersRes, pickingRes, tenantsRes, profilesRes, shipmentsRes] = await Promise.all([
        api.get<OrderRow[]>("/api/orders?fields=id,status,tenant_id,created_at,order_number,customer_name,items"),
        api.get<PickingTask[]>("/api/picking-tasks"),
        api.get<TenantRow[]>("/api/tenants"),
        api.get<ProfileRow[]>("/api/profiles"),
        api.get<ShipmentRow[]>("/api/shipments?limit=50"),
      ]);

      orders = ordersRes || [];
      pickingTasks = pickingRes || [];
      tenants = tenantsRes || [];
      profiles = profilesRes || [];
      shipments = shipmentsRes || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("Error fetching logistics data:", err);
      toast({ title: "Erro", description: message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));
    const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.name]));
    const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]));

    // Calculate stats
    const awaitingPicking = orders.filter((o) => o.status === "approved" || o.status === "confirmed").length;
    const inPicking = orders.filter((o) => o.status === "picking").length;
    const inPacking = orders.filter((o) => o.status === "packing").length;
    const labeled = orders.filter((o) => o.status === "labeled").length;

    const today = new Date().toISOString().split("T")[0];
    const shippedToday = shipments.filter(
      (s) => s.shipped_at && s.shipped_at.startsWith(today)
    ).length;

    const completedTasks = pickingTasks.filter((t) => t.completed_at && t.started_at);
    const avgMs = completedTasks.length
      ? completedTasks.reduce((sum, t) => {
          return sum + (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime());
        }, 0) / completedTasks.length
      : 0;

    setStats({
      awaitingPicking,
      inPicking,
      inPacking,
      labeled,
      shippedToday,
      avgFulfillmentMin: Math.round(avgMs / 60000),
    });

    // Build tasks list
    const taskRows: PickingTaskRow[] = pickingTasks.map((t) => {
      const order = orderMap[t.order_id];
      const itemsArray: OrderItemEntry[] = order?.items || [];
      return {
        id: t.id,
        order_id: t.order_id,
        operator_id: t.operator_id,
        status: t.status || "pending",
        started_at: t.started_at,
        completed_at: t.completed_at,
        created_at: t.created_at,
        order_number: order?.order_number || t.order_id.slice(0, 8),
        order_status: order?.status || "unknown",
        ml_status: (order as any)?.ml_status || null,
        tenant_name: order ? tenantMap[order.tenant_id] || "—" : "—",
        operator_name: t.operator_id ? profileMap[t.operator_id] || "—" : "Não atribuído",
        item_count: itemsArray.length,
        customer_name: order?.customer_name || "—",
      };
    });

    // Also add orders that are approved but don't have picking tasks yet
    const taskOrderIds = new Set(pickingTasks.map((t) => t.order_id));
    const pendingOrders = orders.filter(
      (o) => (o.status === "approved" || o.status === "confirmed") && !taskOrderIds.has(o.id)
    );
    for (const order of pendingOrders) {
      const itemsArray: OrderItemEntry[] = order.items || [];
      taskRows.push({
        id: `pending-${order.id}`,
        order_id: order.id,
        operator_id: null,
        status: "awaiting",
        started_at: null,
        completed_at: null,
        created_at: order.created_at,
        order_number: order.order_number || order.id.slice(0, 8),
        order_status: order.status,
        ml_status: (order as any)?.ml_status || null,
        tenant_name: tenantMap[order.tenant_id] || "—",
        operator_name: "Não atribuído",
        item_count: itemsArray.length,
        customer_name: order.customer_name || "—",
      });
    }

    // Sort: pending/awaiting first, then picking, then completed
    const statusOrder: Record<string, number> = { awaiting: 0, pending: 1, picking: 2, packing: 3, completed: 4 };
    taskRows.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

    setTasks(taskRows);
    setLoading(false);
  };


  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const min = Math.round(ms / 60000);
    return min > 0 ? `${min}min` : "<1min";
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const pendingTasks = tasks.filter((t) => ["awaiting", "pending"].includes(t.status));
  const activeTasks = tasks.filter((t) => ["picking", "packing"].includes(t.status));
  const doneTasks = tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-6 max-w-[1600px] animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            Logística & Expedição
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral da operação do galpão e rastreamento de envios
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

      {/* Pipeline Visual */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card">
        <h2 className="font-display text-sm font-semibold text-muted-foreground mb-4">PIPELINE DE EXPEDIÇÃO</h2>
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-0">
          {[
            { label: "Aguardando", value: stats.awaitingPicking, icon: Clock, color: "text-info" },
            { label: "Separando", value: stats.inPicking, icon: Package, color: "text-warning" },
            { label: "Embalando", value: stats.inPacking, icon: Boxes, color: "text-accent" },
            { label: "Etiquetado", value: stats.labeled, icon: Tag, color: "text-primary" },
            { label: "Expedidos Hoje", value: stats.shippedToday, icon: Truck, color: "text-success" },
          ].map((step, idx, arr) => (
            <div key={step.label} className="flex items-center gap-2 md:gap-0 flex-1 w-full md:w-auto">
              <div className="flex-1 bg-secondary/30 rounded-xl p-4 text-center">
                <step.icon className={`w-6 h-6 mx-auto mb-1 ${step.color}`} />
                <p className="font-display text-2xl font-bold text-foreground">{step.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{step.label}</p>
              </div>
              {idx < arr.length - 1 && (
                <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden md:block mx-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Timer className="w-4 h-4" />
            <span className="text-[10px] font-medium">Tempo Médio Fulfillment</span>
          </div>
          <p className="font-display text-xl font-bold text-foreground">
            {stats.avgFulfillmentMin > 0 ? `${stats.avgFulfillmentMin}min` : "—"}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="w-4 h-4" />
            <span className="text-[10px] font-medium">Total na Fila</span>
          </div>
          <p className="font-display text-xl font-bold text-foreground">
            {stats.awaitingPicking + stats.inPicking + stats.inPacking + stats.labeled}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-success mb-1">
            <Truck className="w-4 h-4" />
            <span className="text-[10px] font-medium">Expedidos Hoje</span>
          </div>
          <p className="font-display text-xl font-bold text-success">{stats.shippedToday}</p>
        </div>
      </div>

      {/* Tasks Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline" className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Pendentes ({pendingTasks.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-1.5">
            <Package className="w-4 h-4" />
            Em Andamento ({activeTasks.length})
          </TabsTrigger>
          <TabsTrigger value="done" className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Concluídos ({doneTasks.length})
          </TabsTrigger>
        </TabsList>

        {[
          { key: "pipeline", data: pendingTasks, emptyIcon: CheckCircle2, emptyText: "Nenhum pedido aguardando separação" },
          { key: "active", data: activeTasks, emptyIcon: Package, emptyText: "Nenhum pedido em andamento" },
          { key: "done", data: doneTasks, emptyIcon: Truck, emptyText: "Nenhum pedido concluído recentemente" },
        ].map(({ key, data, emptyIcon: EmptyIcon, emptyText }) => (
          <TabsContent key={key} value={key}>
            {data.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
                <EmptyIcon className="w-10 h-10 mb-3 opacity-40" />
                <p className="font-medium">{emptyText}</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Pedido</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Cliente</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vendedor</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Itens</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Operador</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Status ML</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Duração</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Criado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((task) => (
                        <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-foreground font-mono">{task.order_number}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground">{task.customer_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground">{task.tenant_name}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-medium text-foreground">{task.item_count}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm text-foreground">{task.operator_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={task.status === "awaiting" ? "approved" : task.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                              {getMlStatusLabel(task.ml_status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(task.started_at, task.completed_at || (task.started_at ? new Date().toISOString() : null))}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-muted-foreground">{formatDate(task.created_at)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Logistica;
