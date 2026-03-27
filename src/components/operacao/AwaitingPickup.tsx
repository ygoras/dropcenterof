import { Truck, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { OrderTask } from "./types";

interface Props {
  orders: OrderTask[];
  onMarkShipped: (orderId: string) => Promise<void>;
}

export function AwaitingPickup({ orders, onMarkShipped }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
        <Truck className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Nenhum pedido aguardando retirada</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {orders.map((order) => (
        <div key={order.order_id} className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
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
          <div className="flex justify-end">
            <button
              onClick={() => onMarkShipped(order.order_id)}
              className="h-8 px-4 rounded-lg text-xs font-semibold text-primary-foreground gradient-primary flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirmar Envio
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
