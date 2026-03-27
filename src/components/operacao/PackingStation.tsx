import { useState, useEffect, useRef, useCallback } from "react";
import { ScanBarcode, Timer, CheckCircle2, Package, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import type { OrderTask } from "./types";

interface Props {
  orders: OrderTask[];
  onCompletePacking: (orderId: string) => Promise<void>;
}

export function PackingStation({ orders, onCompletePacking }: Props) {
  const [scanInput, setScanInput] = useState("");
  const [activeOrder, setActiveOrder] = useState<OrderTask | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [completing, setCompleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Timer tick
  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => setElapsed(Date.now() - timerStart), 100);
    return () => clearInterval(interval);
  }, [timerStart]);

  // Focus scan input when no active order
  useEffect(() => {
    if (!activeOrder) inputRef.current?.focus();
  }, [activeOrder]);

  const formatTimer = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleScan = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // Match by order_number, tracking_code, or order_id prefix
      const found = orders.find(
        (o) =>
          o.order_number === trimmed ||
          o.tracking_code === trimmed ||
          o.order_id.startsWith(trimmed)
      );

      if (found) {
        setActiveOrder(found);
        setTimerStart(Date.now());
        setElapsed(0);
        toast.success(`Pedido ${found.order_number} — iniciando embalagem`);
      } else {
        toast.error("Pedido não encontrado. Verifique o código.");
      }
      setScanInput("");
    },
    [orders]
  );

  const handleFinishPacking = useCallback(async () => {
    if (!activeOrder || completing) return;
    setCompleting(true);
    try {
      await onCompletePacking(activeOrder.order_id);
      const time = formatTimer(elapsed);
      toast.success(`Pedido ${activeOrder.order_number} embalado em ${time}!`);
      setActiveOrder(null);
      setTimerStart(null);
      setElapsed(0);
      inputRef.current?.focus();
    } catch {
      toast.error("Erro ao finalizar embalagem");
    } finally {
      setCompleting(false);
    }
  }, [activeOrder, completing, elapsed, onCompletePacking]);

  // Enter key to finish packing
  useEffect(() => {
    if (!activeOrder) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleFinishPacking();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeOrder, handleFinishPacking]);

  // Picking orders (not yet at packing station)
  const pickingOrders = orders.filter((o) => o.order_status === "picking");
  const packingOrders = orders.filter((o) => o.order_status === "packing");

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
        <Package className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Nenhum pedido em andamento</p>
        <p className="text-sm mt-1">Selecione pedidos na fila para iniciar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active packing order */}
      {activeOrder ? (
        <div className="bg-card rounded-xl border-2 border-primary shadow-elevated p-6 space-y-4 animate-fade-in">
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

          {/* Items to verify */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Itens para conferir:</p>
            {activeOrder.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{item.product_sku}</p>
                </div>
                <span className="text-lg font-bold text-foreground">x{item.quantity}</span>
              </div>
            ))}
          </div>

          {/* Finish button */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Pressione <kbd className="px-1.5 py-0.5 bg-secondary rounded text-foreground font-mono text-[10px]">Enter</kbd> para finalizar</span>
            </div>
            <button
              onClick={handleFinishPacking}
              disabled={completing}
              className="h-10 px-6 rounded-lg text-sm font-semibold text-primary-foreground gradient-primary flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {completing ? "Finalizando..." : "Finalizar Embalagem"}
            </button>
          </div>
        </div>
      ) : (
        /* Scan input */
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <div className="flex flex-col items-center gap-4">
            <ScanBarcode className="w-10 h-10 text-primary opacity-60" />
            <div className="text-center">
              <p className="font-medium text-foreground">Bipe o código do pedido para embalar</p>
              <p className="text-sm text-muted-foreground mt-1">Escaneie o código de barras da etiqueta ou digite o número do pedido</p>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleScan(scanInput);
                }
              }}
              placeholder="Escanear ou digitar código..."
              className="w-full max-w-md h-12 px-4 rounded-lg border border-border bg-background text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Queue of orders in progress */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
          Pedidos na bancada ({pickingOrders.length + packingOrders.length})
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...packingOrders, ...pickingOrders].map((order) => (
            <div
              key={order.order_id}
              className={`bg-card rounded-xl border border-border p-4 shadow-card space-y-2 ${
                activeOrder?.order_id === order.order_id ? "ring-2 ring-primary" : ""
              }`}
            >
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
              {order.tracking_code && (
                <p className="text-[10px] font-mono text-primary">{order.tracking_code}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
