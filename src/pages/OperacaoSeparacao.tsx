import { useState, useEffect, useCallback, useMemo } from "react";
import { Package, RefreshCw, CheckSquare, Square, ChevronDown, ChevronRight, Play, Filter, Search, Printer, X } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import type { OrderTask, OrderItem } from "@/components/operacao/types";

interface SkuGroup {
  sku: string;
  productName: string;
  totalQty: number;
  orders: OrderTask[];
  category?: string;
}

const MAX_SELECT = 50;

const OperacaoSeparacao = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<OrderTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [labelPdfUrl, setLabelPdfUrl] = useState<string | null>(null);
  const [pendingClaimIds, setPendingClaimIds] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [orders, tenants, products, shipments] = await Promise.all([
      api.get<any[]>("/api/orders?status=approved,confirmed&order=created_at.asc&fields=id,status,tenant_id,created_at,order_number,customer_name,items"),
      api.get<any[]>("/api/tenants?fields=id,name"),
      api.get<any[]>("/api/products?fields=id,name,sku,category"),
      api.get<any[]>("/api/shipments?fields=id,order_id,ml_shipment_id,tracking_code,label_url"),
    ]).then(res => res.map(r => r ?? []));

    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t.id, t.name]));
    const productMap = Object.fromEntries(products.map((p: any) => [p.id, { name: p.name, sku: p.sku, category: p.category }]));
    const shipmentMap = Object.fromEntries(shipments.map((s: any) => [s.order_id, s]));

    const tasks: OrderTask[] = orders.map((order: any) => {
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
            category: prod?.category || "",
          };
        }),
        shipment_id: shipment?.id,
        ml_shipment_id: shipment?.ml_shipment_id,
        tracking_code: shipment?.tracking_code,
        label_url: shipment?.label_url,
      };
    });

    setQueue(tasks);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useSSE(["orders"], () => fetchData());

  const skuGroups = useMemo(() => {
    const map = new Map<string, SkuGroup>();
    for (const order of queue) {
      for (const item of order.items) {
        const key = item.product_sku || "SEM-SKU";
        if (!map.has(key)) {
          map.set(key, { sku: key, productName: item.product_name, totalQty: 0, orders: [], category: (item as any).category || "" });
        }
        const group = map.get(key)!;
        group.totalQty += item.quantity;
        if (!group.orders.find((o) => o.order_id === order.order_id)) {
          group.orders.push(order);
        }
      }
    }
    let groups = Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);

    if (skuFilter) {
      const f = skuFilter.toLowerCase();
      groups = groups.filter((g) => g.sku.toLowerCase().includes(f) || g.productName.toLowerCase().includes(f));
    }
    if (categoryFilter) {
      const f = categoryFilter.toLowerCase();
      groups = groups.filter((g) => g.category?.toLowerCase().includes(f));
    }
    return groups;
  }, [queue, skuFilter, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const order of queue) {
      for (const item of order.items) {
        if ((item as any).category) cats.add((item as any).category);
      }
    }
    return Array.from(cats).sort();
  }, [queue]);

  const toggleSelect = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        if (next.size >= MAX_SELECT) {
          toast.warning(`Máximo de ${MAX_SELECT} pedidos por vez`);
          return prev;
        }
        next.add(orderId);
      }
      return next;
    });
  };

  const selectAllInSku = (group: SkuGroup) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = group.orders.every((o) => next.has(o.order_id));
      if (allSelected) {
        group.orders.forEach((o) => next.delete(o.order_id));
      } else {
        for (const o of group.orders) {
          if (next.size >= MAX_SELECT) {
            toast.warning(`Máximo de ${MAX_SELECT} pedidos por vez`);
            break;
          }
          next.add(o.order_id);
        }
      }
      return next;
    });
  };

  // Step 1: Show label PDF first (don't change order status yet)
  const handleClaimSelected = async () => {
    if (selected.size === 0) {
      toast.warning("Selecione pelo menos um pedido");
      return;
    }
    const ids = Array.from(selected);
    const selectedTasks = queue.filter((o) => selected.has(o.order_id));
    const shipmentIds = selectedTasks
      .filter((t) => t.ml_shipment_id)
      .map((t) => t.ml_shipment_id)
      .join(",");

    if (shipmentIds) {
      setPendingClaimIds(ids);
      // Fetch PDF as blob (iframe can't send Auth header)
      try {
        const clerkToken = await (window as any).Clerk?.session?.getToken();
        const res = await fetch(`/api/ml/label-pdf/${shipmentIds}`, {
          headers: { 'Authorization': `Bearer ${clerkToken}` },
        });
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          setLabelPdfUrl(blobUrl);
        } else {
          toast.error("Erro ao buscar etiqueta do ML");
        }
      } catch {
        toast.error("Erro ao buscar etiqueta");
      }
    } else {
      toast.info("Nenhuma etiqueta disponivel — aguarde o ML processar");
    }
  };

  // Step 2: After confirming print, change status to picking
  const handleConfirmPrint = async () => {
    if (!user || pendingClaimIds.length === 0) return;
    setClaiming(true);
    try {
      for (const orderId of pendingClaimIds) {
        await api.patch(`/api/orders/${orderId}`, { status: "picking" });
        await api.post("/api/picking-tasks", {
          order_id: orderId, operator_id: user.id, status: "picking", started_at: new Date().toISOString(),
        });
      }
      toast.success(`${pendingClaimIds.length} pedido(s) em separacao`);
      setSelected(new Set());
      setPendingClaimIds([]);
      if (labelPdfUrl?.startsWith('blob:')) URL.revokeObjectURL(labelPdfUrl);
      setLabelPdfUrl(null);
      await fetchData();
    } catch {
      toast.error("Erro ao iniciar separacao");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/operacao" className="hover:text-foreground transition-colors">Operação</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Separação</span>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <Package className="w-6 h-6 text-info" />
              Separação de Produtos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{queue.length} pedido(s) aguardando separação</p>
          </div>
        </div>
        <button onClick={fetchData} className="h-10 px-5 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors self-start">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filtrar por SKU ou produto..."
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 pl-10 pr-8 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            <option value="">Todas categorias</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
      </div>

      {/* Action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-4 animate-fade-in sticky top-0 z-10">
          <span className="text-sm font-medium text-primary">{selected.size} pedido(s) selecionado(s) (máx {MAX_SELECT})</span>
          <button
            onClick={handleClaimSelected}
            disabled={claiming}
            className="h-9 px-5 rounded-lg text-sm font-semibold text-primary-foreground gradient-primary flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {claiming ? "Processando..." : "Separar & Imprimir Etiquetas"}
          </button>
        </div>
      )}

      {/* SKU groups */}
      {skuGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
          <CheckSquare className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-medium">Fila vazia!</p>
          <p className="text-sm mt-1">Nenhum pedido aguardando separação</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skuGroups.map((group) => {
            const isExpanded = expandedSku === group.sku;
            const allSelected = group.orders.every((o) => selected.has(o.order_id));
            const someSelected = group.orders.some((o) => selected.has(o.order_id));

            return (
              <div key={group.sku} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedSku(isExpanded ? null : group.sku)}
                >
                  <button onClick={(e) => { e.stopPropagation(); selectAllInSku(group); }} className="text-muted-foreground hover:text-primary transition-colors">
                    {allSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : someSelected ? <CheckSquare className="w-5 h-5 text-primary/50" /> : <Square className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-sm font-semibold text-foreground">{group.sku}</span>
                      <span className="text-xs text-muted-foreground truncate">— {group.productName}</span>
                    </div>
                    {group.category && <span className="text-[10px] text-muted-foreground">{group.category}</span>}
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

                {isExpanded && (
                  <div className="border-t border-border divide-y divide-border">
                    {group.orders.map((order) => (
                      <div
                        key={order.order_id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors ${selected.has(order.order_id) ? "bg-primary/5" : ""}`}
                      >
                        <button onClick={() => toggleSelect(order.order_id)} className="text-muted-foreground hover:text-primary transition-colors">
                          {selected.has(order.order_id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium text-foreground">{order.order_number}</p>
                          <p className="text-[10px] text-muted-foreground">{order.tenant_name} • {order.customer_name}</p>
                        </div>
                        <div className="text-right">
                          {order.items.filter((i) => i.product_sku === group.sku).map((i, idx) => (
                            <span key={idx} className="text-sm font-bold text-foreground">x{i.quantity}</span>
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
      )}
      {/* Label PDF Modal — fullscreen */}
      {labelPdfUrl && (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex flex-col bg-background" style={{ width: '100vw', height: '100vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Printer className="w-4 h-4 text-primary" />
              Etiquetas — {pendingClaimIds.length} pedido(s)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const iframe = document.getElementById('label-iframe') as HTMLIFrameElement;
                  if (iframe?.contentWindow) iframe.contentWindow.print();
                }}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <button
                onClick={handleConfirmPrint}
                disabled={claiming}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors text-xs font-medium disabled:opacity-50"
              >
                {claiming ? "Processando..." : "Confirmar e Iniciar Separacao"}
              </button>
              <button
                onClick={() => { if (labelPdfUrl?.startsWith('blob:')) URL.revokeObjectURL(labelPdfUrl); setLabelPdfUrl(null); setPendingClaimIds([]); }}
                className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* PDF — ocupa 100% da tela restante */}
          <iframe
            id="label-iframe"
            src={labelPdfUrl}
            className="w-full border-0"
            style={{ flex: 1, minHeight: 0 }}
            title="Etiquetas ML"
          />
        </div>
      )}
    </div>
  );
};

export default OperacaoSeparacao;
