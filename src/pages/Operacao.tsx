import { useState, useEffect, useCallback } from "react";
import { Package, RefreshCw, Clock, CheckCircle2, Truck, BoxesIcon } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { OperacaoStats } from "@/components/operacao/OperacaoStats";
import { SkuPickingQueue } from "@/components/operacao/SkuPickingQueue";
import { PackingStation } from "@/components/operacao/PackingStation";
import { AwaitingPickup } from "@/components/operacao/AwaitingPickup";
import type { OrderTask } from "@/components/operacao/types";

const Operacao = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<OrderTask[]>([]);
  const [inProgress, setInProgress] = useState<OrderTask[]>([]);
  const [packed, setPacked] = useState<OrderTask[]>([]);
  const [completed, setCompleted] = useState<OrderTask[]>([]);
  const [stats, setStats] = useState({ queue: 0, inProgress: 0, completedToday: 0, avgTime: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [orders, items, pickingTasks, tenants, products, shipments] = await Promise.all([
      api.get<any[]>("/api/orders?status=approved,confirmed,picking,packing,packed,labeled,shipped&order=created_at.asc&fields=id,status,tenant_id,created_at,order_number,customer_name"),
      api.get<any[]>("/api/order-items?fields=order_id,product_id,quantity"),
      api.get<any[]>("/api/picking-tasks"),
      api.get<any[]>("/api/tenants?fields=id,name"),
      api.get<any[]>("/api/products?fields=id,name,sku"),
      api.get<any[]>("/api/shipments?fields=id,order_id,ml_shipment_id,tracking_code,label_url,status"),
    ]).then(res => res.map(r => r ?? []));

    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t.id, t.name]));
    const productMap = Object.fromEntries(products.map((p: any) => [p.id, { name: p.name, sku: p.sku }]));
    const shipmentMap = Object.fromEntries(shipments.map((s: any) => [s.order_id, s]));

    const buildTask = (order: any): OrderTask => {
      const orderItems = items.filter((i: any) => i.order_id === order.id);
      const picking = pickingTasks.find((t: any) => t.order_id === order.id);
      const shipment = shipmentMap[order.id];
      return {
        order_id: order.id,
        order_status: order.status,
        order_number: order.order_number || order.id.slice(0, 8),
        created_at: order.created_at,
        tenant_name: tenantMap[order.tenant_id] || "—",
        customer_name: order.customer_name || "—",
        items: orderItems.map((i: any) => ({
          product_name: productMap[i.product_id]?.name || "—",
          product_sku: productMap[i.product_id]?.sku || "—",
          quantity: i.quantity,
        })),
        picking_task_id: picking?.id,
        picking_status: picking?.status,
        shipment_id: shipment?.id,
        ml_shipment_id: shipment?.ml_shipment_id,
        tracking_code: shipment?.tracking_code,
        label_url: shipment?.label_url,
      };
    };

    const queueOrders = orders.filter((o: any) => o.status === "approved" || o.status === "confirmed").map(buildTask);
    const inProgressOrders = orders.filter((o: any) => ["picking", "packing"].includes(o.status)).map(buildTask);
    const packedOrders = orders.filter((o: any) => o.status === "packed" || o.status === "labeled").map(buildTask);
    const completedOrders = orders.filter((o: any) => o.status === "shipped").map(buildTask);

    const today = new Date().toISOString().split("T")[0];
    const completedToday = pickingTasks.filter((t: any) => t.completed_at && t.completed_at.startsWith(today)).length;
    const done = pickingTasks.filter((t: any) => t.completed_at && t.started_at);
    const avgMs = done.length
      ? done.reduce((s: number, t: any) => s + (new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()), 0) / done.length
      : 0;

    setQueue(queueOrders);
    setInProgress(inProgressOrders);
    setPacked(packedOrders);
    setCompleted(completedOrders.slice(0, 20));
    setStats({
      queue: queueOrders.length,
      inProgress: inProgressOrders.length,
      completedToday,
      avgTime: Math.round(avgMs / 60000),
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useSSE(["orders", "picking_tasks"], () => fetchData());

  // Batch start picking — claim orders for this operator
  const handleStartPicking = async (orderIds: string[]) => {
    if (!user) return;
    for (const orderId of orderIds) {
      await api.patch(`/api/orders/${orderId}`, { status: "picking" });
      await api.post("/api/picking-tasks", {
        order_id: orderId, operator_id: user.id, status: "picking", started_at: new Date().toISOString(),
      });
    }
    await fetchData();
  };

  // Print labels (open label URLs)
  const handlePrintLabels = (tasks: OrderTask[]) => {
    const withLabels = tasks.filter((t) => t.label_url);
    if (withLabels.length > 0) {
      withLabels.forEach((t) => window.open(t.label_url!, "_blank"));
      toast.success(`${withLabels.length} etiqueta(s) abertas para impressão`);
    } else {
      toast.info("Nenhuma etiqueta disponível ainda — imprima após gerar via ML");
    }
  };

  // Complete packing — move to packed (awaiting pickup)
  const handleCompletePacking = async (orderId: string) => {
    await api.patch(`/api/orders/${orderId}`, { status: "packed" });
    await api.patch(`/api/picking-tasks/by-order/${orderId}`, { status: "completed", completed_at: new Date().toISOString() });
    await fetchData();
  };

  // Mark as shipped
  const handleMarkShipped = async (orderId: string) => {
    await api.patch(`/api/orders/${orderId}`, { status: "shipped" });
    await api.patch(`/api/shipments/by-order/${orderId}`, { status: "shipped", shipped_at: new Date().toISOString() });
    toast.success("Pedido marcado como enviado!");
    await fetchData();
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Portal de Operação
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Separação por SKU, embalagem com timer e expedição
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

      <OperacaoStats stats={stats} />

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue" className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Separação ({queue.length})
          </TabsTrigger>
          <TabsTrigger value="packing" className="flex items-center gap-1.5">
            <BoxesIcon className="w-4 h-4" />
            Embalagem ({inProgress.length})
          </TabsTrigger>
          <TabsTrigger value="packed" className="flex items-center gap-1.5">
            <Truck className="w-4 h-4" />
            Aguard. Retirada ({packed.length})
          </TabsTrigger>
          <TabsTrigger value="done" className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Concluídos ({completed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <SkuPickingQueue queue={queue} onStartPicking={handleStartPicking} onPrintLabels={handlePrintLabels} />
        </TabsContent>

        <TabsContent value="packing">
          <PackingStation orders={inProgress} onCompletePacking={handleCompletePacking} />
        </TabsContent>

        <TabsContent value="packed">
          <AwaitingPickup orders={packed} onMarkShipped={handleMarkShipped} />
        </TabsContent>

        <TabsContent value="done">
          {completed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
              <CheckCircle2 className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhum pedido concluído recentemente</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completed.map((order) => (
                <div key={order.order_id} className="bg-card rounded-xl border border-border p-4 shadow-card space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-mono font-semibold text-foreground">{order.order_number}</p>
                      <p className="text-[10px] text-muted-foreground">{order.tenant_name}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  </div>
                  <div className="space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-foreground">{item.product_name}</span>
                        <span className="text-xs font-bold">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Operacao;
