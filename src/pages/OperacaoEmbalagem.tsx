import { useState, useEffect, useCallback, useRef } from "react";
import { BoxesIcon, RefreshCw, ArrowLeft, ScanBarcode, Timer, CheckCircle2, Package, AlertCircle, Truck } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import type { OrderTask } from "@/components/operacao/types";

const OperacaoEmbalagem = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<OrderTask[]>([]);
  const [packedOrders, setPackedOrders] = useState<OrderTask[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderTask | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [orders, tenants, products, shipments] = await Promise.all([
      api.get<any[]>("/api/orders?status=picking,packing,packed,labeled&order=created_at.asc&fields=id,status,tenant_id,created_at,order_number,customer_name,items"),
      api.get<any[]>("/api/tenants?fields=id,name"),
      api.get<any[]>("/api/products?fields=id,name,sku,images"),
      api.get<any[]>("/api/shipments?fields=id,order_id,ml_shipment_id,tracking_code,label_url,status"),
    ]).then(res => res.map(r => r ?? []));

    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t.id, t.name]));
    const productMap = Object.fromEntries(products.map((p: any) => [p.id, { name: p.name, sku: p.sku, image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null }]));
    const shipmentMap = Object.fromEntries(shipments.map((s: any) => [s.order_id, s]));

    const buildTask = (order: any): OrderTask => {
      const orderItems = Array.isArray(order.items) ? order.items : [];
      const shipment = shipmentMap[order.id];
      return {
        order_id: order.id,
        order_status: order.status,
        order_number: order.order_number || order.id.slice(0, 8),
        created_at: order.created_at,
        tenant_name: tenantMap[order.tenant_id] || "—",
        customer_name: order.customer_name || "—",
        items: orderItems.map((i: any) => {
          const prod = i.product_id ? productMap[i.product_id] : null;
          return {
            product_name: prod?.name || i.product_name || "—",
            product_sku: prod?.sku || i.sku || "—",
            quantity: i.quantity || 1,
            image_url: prod?.image || null,
          };
        }),
        shipment_id: shipment?.id,
        ml_shipment_id: shipment?.ml_shipment_id,
        tracking_code: shipment?.tracking_code,
        label_url: shipment?.label_url,
      };
    };

    const pending = orders.filter((o: any) => ["picking", "packing"].includes(o.status)).map(buildTask);
    const packed = orders.filter((o: any) => o.status === "packed" || o.status === "labeled").map(buildTask);

    setPendingOrders(pending);
    setPackedOrders(packed);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useSSE(["orders"], () => fetchData());

  // Timer
  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => setElapsed(Date.now() - timerStart), 100);
    return () => clearInterval(interval);
  }, [timerStart]);

  // Focus scan input
  useEffect(() => {
    if (!activeOrder) inputRef.current?.focus();
  }, [activeOrder]);

  const formatTimer = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const handleScan = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Only search pending orders — packed orders cannot be re-packed
    const found = pendingOrders.find(
      (o) =>
        o.ml_shipment_id === trimmed ||
        o.order_number === trimmed ||
        o.tracking_code === trimmed ||
        o.order_id.startsWith(trimmed)
    );

    if (found) {
      setActiveOrder(found);
      setTimerStart(Date.now());
      setElapsed(0);
      // Update status to packing
      api.patch(`/api/orders/${found.order_id}`, { status: "packing" }).then(() => fetchData());
      toast.success(`Pedido ${found.order_number} — embalagem iniciada`);
    } else {
      // Check if it's already packed
      const alreadyPacked = packedOrders.find(
        (o) =>
          o.ml_shipment_id === trimmed ||
          o.order_number === trimmed ||
          o.tracking_code === trimmed ||
          o.order_id.startsWith(trimmed)
      );
      if (alreadyPacked) {
        toast.warning(`Pedido ${alreadyPacked.order_number} já foi embalado.`);
      } else {
        toast.error("Código não encontrado. Verifique a etiqueta.");
      }
    }
    setScanInput("");
  };

  const handleFinishPacking = useCallback(async () => {
    if (!activeOrder || completing) return;
    // Guard: prevent finishing within 1.5s of starting (avoids Enter race condition from scan)
    if (timerStart && (Date.now() - timerStart) < 1500) return;
    setCompleting(true);
    try {
      await api.patch(`/api/orders/${activeOrder.order_id}`, { status: "packed" });
      await api.patch(`/api/picking-tasks/by-order/${activeOrder.order_id}`, { status: "completed", completed_at: new Date().toISOString() });
      toast.success(`Pedido ${activeOrder.order_number} embalado em ${formatTimer(elapsed)}!`);
      setActiveOrder(null);
      setTimerStart(null);
      setElapsed(0);
      await fetchData();
      inputRef.current?.focus();
    } catch {
      toast.error("Erro ao finalizar embalagem");
    } finally {
      setCompleting(false);
    }
  }, [activeOrder, completing, elapsed, fetchData, timerStart]);

  // Enter to finish packing — delay listener to avoid race condition with scan Enter
  useEffect(() => {
    if (!activeOrder) return;
    const timeoutId = setTimeout(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); handleFinishPacking(); }
      };
      window.addEventListener("keydown", handler);
      // Store handler for cleanup
      (window as any).__packingHandler = handler;
    }, 500);
    return () => {
      clearTimeout(timeoutId);
      const h = (window as any).__packingHandler;
      if (h) { window.removeEventListener("keydown", h); delete (window as any).__packingHandler; }
    };
  }, [activeOrder, handleFinishPacking]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in p-6">
        {[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-xl border border-border p-5 h-24 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1200px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/operacao" className="h-10 w-10 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-secondary/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <BoxesIcon className="w-6 h-6 text-warning" />
              Bancada de Embalagem
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{pendingOrders.length} pendente(s) • {packedOrders.length} aguardando retirada</p>
          </div>
        </div>
        <button onClick={fetchData} className="h-10 px-5 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors self-start">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Active packing */}
      {activeOrder ? (
        <div className="glass-card rounded-2xl border-2 border-primary shadow-glow p-4 sm:p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">EMBALANDO</p>
              <p className="text-xl font-mono font-bold text-foreground">{activeOrder.order_number}</p>
              <p className="text-sm text-muted-foreground">{activeOrder.tenant_name} • {activeOrder.customer_name}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-warning">
                <Timer className="w-5 h-5" />
                <span className="text-3xl font-mono font-bold">{formatTimer(elapsed)}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Itens para conferir:</p>
            {activeOrder.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 bg-secondary/30 rounded-lg px-4 py-3">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.product_name} className="w-16 h-16 rounded-lg object-cover border border-border flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                  <p className="text-xs font-mono text-muted-foreground">SKU: {item.product_sku}</p>
                </div>
                <span className="text-lg font-bold text-foreground flex-shrink-0">x{item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Pressione <kbd className="px-1.5 py-0.5 bg-secondary rounded text-foreground font-mono text-[10px]">Enter</kbd> para finalizar</span>
            </div>
            <button onClick={handleFinishPacking} disabled={completing} className="h-10 px-6 rounded-lg text-sm font-semibold text-primary-foreground gradient-primary flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" />
              {completing ? "Finalizando..." : "Finalizar Embalagem"}
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col items-center gap-4">
            <ScanBarcode className="w-10 h-10 text-primary opacity-60" />
            <div className="text-center">
              <p className="font-medium text-foreground">Bipe o código do pedido para embalar</p>
              <p className="text-sm text-muted-foreground mt-1">Escaneie o código de envio da etiqueta (shipment ID) ou digite o número do pedido</p>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
              placeholder="Escanear ou digitar código..."
              className="w-full max-w-md h-12 px-4 rounded-lg border border-border bg-background text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Pending packing */}
      {pendingOrders.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            <BoxesIcon className="w-3.5 h-3.5 inline mr-1" />
            Embalagens Pendentes ({pendingOrders.length})
          </p>
          <div className="grid grid-cols-1 gap-3">
            {pendingOrders.map((order) => (
              <div key={order.order_id} className={`glass-card rounded-2xl p-4 space-y-2 ${activeOrder?.order_id === order.order_id ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono font-semibold text-foreground">{order.order_number}</p>
                    <p className="text-[10px] text-muted-foreground">{order.tenant_name} • {order.customer_name}</p>
                  </div>
                  <StatusBadge status={order.order_status} />
                </div>
                <div className="space-y-1">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-foreground">{item.product_name}</span>
                      <span className="text-xs font-bold text-foreground">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
                {order.tracking_code && <p className="text-[10px] font-mono text-primary">{order.tracking_code}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Awaiting pickup */}
      {packedOrders.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            <Truck className="w-3.5 h-3.5 inline mr-1" />
            Aguardando Retirada ({packedOrders.length})
          </p>
          <div className="grid grid-cols-1 gap-3">
            {packedOrders.map((order) => (
              <div key={order.order_id} className="glass-card rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono font-semibold text-foreground">{order.order_number}</p>
                    <p className="text-[10px] text-muted-foreground">{order.tenant_name} • {order.customer_name}</p>
                  </div>
                  <StatusBadge status="packed" />
                </div>
                <div className="space-y-1">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-foreground">{item.product_name}</span>
                      <span className="text-xs font-bold text-foreground">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
                {order.tracking_code && (
                  <div className="bg-primary/5 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-mono text-primary">{order.tracking_code}</span>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground italic">Sai da fila quando o ML bipar para coleta</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingOrders.length === 0 && packedOrders.length === 0 && !activeOrder && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
          <Package className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-medium">Nenhum pedido na bancada</p>
          <p className="text-sm mt-1">Selecione pedidos na <Link to="/operacao/separacao" className="text-primary underline">separação</Link> para iniciar</p>
        </div>
      )}
    </div>
  );
};

export default OperacaoEmbalagem;
