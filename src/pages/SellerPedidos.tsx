import { useState } from "react";
import { formatCurrency, formatDateTime as formatDate } from "@/lib/formatters";
import {
  ShoppingCart,
  Search,
  Filter,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Eye,
  Copy,
  Store,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrders } from "@/hooks/useOrders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/StatCard";
import { toast } from "@/hooks/use-toast";

const orderStatusFlow: Record<string, { label: string; badgeStatus: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", badgeStatus: "pending", icon: Clock },
  pending_credit: { label: "Pendente Crédito", badgeStatus: "pending_credit", icon: Clock },
  approved: { label: "Aprovado", badgeStatus: "approved", icon: CheckCircle2 },
  picking: { label: "Separando", badgeStatus: "picking", icon: Package },
  packing: { label: "Embalando", badgeStatus: "packing", icon: Package },
  packed: { label: "Aguardando Retirada", badgeStatus: "packed", icon: Package },
  labeled: { label: "Etiquetado", badgeStatus: "labeled", icon: FileText },
  invoiced: { label: "Faturado", badgeStatus: "active", icon: FileText },
  shipped: { label: "Enviado", badgeStatus: "shipped", icon: Truck },
  delivered: { label: "Entregue", badgeStatus: "delivered", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", badgeStatus: "cancelled", icon: XCircle },
  returned: { label: "Devolvido", badgeStatus: "error", icon: Package },
};

import { useMlCredentials } from "@/hooks/useMlCredentials";

const mlStatusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  paid: "Pago",
  payment_required: "Pgto. Pendente",
  payment_in_process: "Pgto. em Processo",
  partially_paid: "Pgto. Parcial",
  partially_refunded: "Reembolso Parcial",
  pending_cancel: "Cancelamento Pendente",
  cancelled: "Cancelado",
  shipped: "Enviado",
  delivered: "Entregue",
};

const SellerPedidos = () => {
  const { orders, loading } = useOrders();
  const { credentials } = useMlCredentials();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [detailOrder, setDetailOrder] = useState<typeof orders[0] | null>(null);

  const filtered = orders.filter((o) => {
    const matchSearch =
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchStore = storeFilter === "all" || o.ml_credential_id === storeFilter;
    return matchSearch && matchStatus && matchStore;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    pendingCredit: orders.filter((o) => o.status === "pending_credit").length,
    inProgress: orders.filter((o) => ["pending_credit", "approved", "picking", "packing", "packed", "labeled", "invoiced", "shipped"].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };


  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary" />
          Meus Pedidos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Acompanhe o status dos seus pedidos
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Total" value={stats.total} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard
          title="Pendentes"
          value={stats.pending}
          changeType={stats.pending > 0 ? "negative" : "positive"}
          change={stats.pending > 0 ? "Aguardando" : "Nenhum"}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          title="Pend. Crédito"
          value={stats.pendingCredit}
          changeType={stats.pendingCredit > 0 ? "negative" : "positive"}
          change={stats.pendingCredit > 0 ? "Sem saldo" : "OK"}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard title="Em Andamento" value={stats.inProgress} icon={<Truck className="w-5 h-5" />} />
        <StatCard title="Entregues" value={stats.delivered} icon={<CheckCircle2 className="w-5 h-5" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número ou cliente..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="pending_credit">Pendente Crédito</SelectItem>
            <SelectItem value="approved">Aprovados</SelectItem>
            <SelectItem value="invoiced">Faturados</SelectItem>
            <SelectItem value="picking">Separando</SelectItem>
            <SelectItem value="packing">Embalando</SelectItem>
            <SelectItem value="packed">Aguardando Retirada</SelectItem>
            <SelectItem value="labeled">Etiquetado</SelectItem>
            <SelectItem value="shipped">Enviados</SelectItem>
            <SelectItem value="delivered">Entregues</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        {credentials.length > 1 && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[200px]">
              <Store className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Todas as lojas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {credentials.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.store_name || c.ml_nickname || c.ml_user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Nenhum pedido encontrado</p>
            <p className="text-xs mt-1">Seus pedidos aparecerão aqui quando forem criados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Pedido</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cliente</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Loja</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Itens</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Total</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status ML</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Rastreio</th>
                   <th className="text-left py-3 px-4 text-muted-foreground font-medium">Data</th>
                   <th className="text-right py-3 px-4 text-muted-foreground font-medium">Ações</th>
                 </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const config = orderStatusFlow[order.status] ?? orderStatusFlow.pending;
                  return (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-foreground">#{order.order_number}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-foreground">{order.customer_name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                          {order.store_name || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground">{order.items?.length ?? 0} item(s)</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{formatCurrency(order.total)}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={config.badgeStatus} label={config.label} />
                      </td>
                      <td className="py-3 px-4">
                        {order.ml_status ? (
                          <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                            {mlStatusLabels[order.ml_status] || order.ml_status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {order.tracking_code ? (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(order.tracking_code!);
                              toast({ title: "Código copiado!" });
                            }}
                            className="flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                          >
                            {order.tracking_code}
                            <Copy className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{formatDate(order.created_at)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setDetailOrder(order)}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Pedido #{detailOrder?.order_number}</DialogTitle>
            <DialogDescription>{detailOrder && formatDate(detailOrder.created_at)}</DialogDescription>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge
                  status={orderStatusFlow[detailOrder.status]?.badgeStatus ?? "pending"}
                  label={orderStatusFlow[detailOrder.status]?.label ?? detailOrder.status}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cliente</span>
                <span className="text-sm font-medium text-foreground">{detailOrder.customer_name}</span>
              </div>
              {detailOrder.customer_email && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">E-mail</span>
                  <span className="text-sm text-foreground">{detailOrder.customer_email}</span>
                </div>
              )}
              {detailOrder.customer_phone && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Telefone</span>
                  <span className="text-sm text-foreground">{detailOrder.customer_phone}</span>
                </div>
              )}
              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground mb-2">Itens</p>
                {(detailOrder.items ?? []).map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
                    <div>
                      <span className="text-sm text-foreground">{item.product_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">SKU: {item.sku}</span>
                    </div>
                    <span className="text-sm text-foreground">{item.quantity}x {formatCurrency(item.unit_price)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm text-foreground">{formatCurrency(detailOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Frete</span>
                  <span className="text-sm text-foreground">{formatCurrency(detailOrder.shipping_cost)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">{formatCurrency(detailOrder.total)}</span>
                </div>
              </div>
              {detailOrder.tracking_code && (
                <div className="flex justify-between items-center border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">Rastreio</span>
                  <span className="text-sm font-mono font-medium text-primary">{detailOrder.tracking_code}</span>
                </div>
              )}
              {detailOrder.shipping_address && (
                <div className="border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">Endereço de entrega</span>
                  <p className="text-sm text-foreground mt-1">
                    {detailOrder.shipping_address.street}, {detailOrder.shipping_address.city} - {detailOrder.shipping_address.state}, {detailOrder.shipping_address.zip}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellerPedidos;
