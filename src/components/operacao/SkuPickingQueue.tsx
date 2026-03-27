import { useState, useMemo } from "react";
import { Package, ChevronDown, ChevronRight, Printer, Play, CheckSquare, Square } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import type { OrderTask } from "./types";

interface Props {
  queue: OrderTask[];
  onStartPicking: (orderIds: string[]) => Promise<void>;
  onPrintLabels: (tasks: OrderTask[]) => void;
}

interface SkuGroup {
  sku: string;
  productName: string;
  totalQty: number;
  orders: OrderTask[];
}

export function SkuPickingQueue({ queue, onStartPicking, onPrintLabels }: Props) {
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [claiming, setClaiming] = useState(false);

  const skuGroups = useMemo(() => {
    const map = new Map<string, SkuGroup>();
    for (const order of queue) {
      for (const item of order.items) {
        const key = item.product_sku || "SEM-SKU";
        if (!map.has(key)) {
          map.set(key, { sku: key, productName: item.product_name, totalQty: 0, orders: [] });
        }
        const group = map.get(key)!;
        group.totalQty += item.quantity;
        if (!group.orders.find((o) => o.order_id === order.order_id)) {
          group.orders.push(order);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [queue]);

  const toggleSelect = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const selectAllInSku = (group: SkuGroup) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = group.orders.every((o) => next.has(o.order_id));
      group.orders.forEach((o) => (allSelected ? next.delete(o.order_id) : next.add(o.order_id)));
      return next;
    });
  };

  const handleClaimSelected = async () => {
    if (selected.size === 0) {
      toast.warning("Selecione pelo menos um pedido");
      return;
    }
    setClaiming(true);
    try {
      const ids = Array.from(selected);
      await onStartPicking(ids);
      const selectedTasks = queue.filter((o) => selected.has(o.order_id));
      onPrintLabels(selectedTasks);
      setSelected(new Set());
      toast.success(`${ids.length} pedido(s) movidos para separação`);
    } catch {
      toast.error("Erro ao iniciar separação");
    } finally {
      setClaiming(false);
    }
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
        <CheckSquare className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Fila vazia!</p>
        <p className="text-sm mt-1">Nenhum pedido aguardando separação</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-4 animate-fade-in">
          <span className="text-sm font-medium text-primary">
            {selected.size} pedido(s) selecionado(s)
          </span>
          <button
            onClick={handleClaimSelected}
            disabled={claiming}
            className="h-9 px-5 rounded-lg text-sm font-semibold text-primary-foreground gradient-primary flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {claiming ? "Processando..." : "Iniciar Separação & Imprimir Etiquetas"}
          </button>
        </div>
      )}

      {/* SKU groups */}
      <div className="space-y-2">
        {skuGroups.map((group) => {
          const isExpanded = expandedSku === group.sku;
          const allSelected = group.orders.every((o) => selected.has(o.order_id));
          const someSelected = group.orders.some((o) => selected.has(o.order_id));

          return (
            <div key={group.sku} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              {/* SKU Header */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => setExpandedSku(isExpanded ? null : group.sku)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInSku(group);
                  }}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {allSelected ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : someSelected ? (
                    <CheckSquare className="w-5 h-5 text-primary/50" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono text-sm font-semibold text-foreground">{group.sku}</span>
                    <span className="text-xs text-muted-foreground truncate">— {group.productName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{group.totalQty}</p>
                    <p className="text-[10px] text-muted-foreground">unidades</p>
                  </div>
                  <div className="bg-info/10 text-info px-2.5 py-1 rounded-full text-xs font-medium">
                    {group.orders.length} pedido{group.orders.length > 1 ? "s" : ""}
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded orders */}
              {isExpanded && (
                <div className="border-t border-border divide-y divide-border">
                  {group.orders.map((order) => (
                    <div
                      key={order.order_id}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors ${
                        selected.has(order.order_id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <button
                        onClick={() => toggleSelect(order.order_id)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        {selected.has(order.order_id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono font-medium text-foreground">{order.order_number}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {order.tenant_name} • {order.customer_name}
                        </p>
                      </div>
                      <div className="text-right">
                        {order.items
                          .filter((i) => i.product_sku === group.sku)
                          .map((i, idx) => (
                            <span key={idx} className="text-sm font-bold text-foreground">
                              x{i.quantity}
                            </span>
                          ))}
                      </div>
                      <StatusBadge status={order.order_status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
