import { useState } from "react";
import {
  Boxes,
  Search,
  AlertTriangle,
  Package,
  ArrowUpDown,
  MapPin,
  TrendingDown,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useProducts } from "@/hooks/useProducts";
import { StockDialog } from "@/components/catalogo/StockDialog";
import type { ProductWithStock } from "@/types/catalog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Estoque = () => {
  const { products, loading, updateStock } = useProducts();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [stockDialog, setStockDialog] = useState<ProductWithStock | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "available" | "min">("available");

  // Only active products
  const activeProducts = products.filter((p) => p.status === "active");

  const filtered = activeProducts
    .filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        stockFilter === "all" ||
        (stockFilter === "low" && p.low_stock) ||
        (stockFilter === "out" && p.stock_available <= 0) ||
        (stockFilter === "ok" && !p.low_stock && p.stock_available > 0);
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortBy === "available") return a.stock_available - b.stock_available;
      if (sortBy === "min") return a.stock_min - b.stock_min;
      return a.name.localeCompare(b.name);
    });

  const stats = {
    totalProducts: activeProducts.length,
    totalUnits: activeProducts.reduce((acc, p) => acc + p.stock_quantity, 0),
    totalReserved: activeProducts.reduce((acc, p) => acc + p.stock_reserved, 0),
    totalAvailable: activeProducts.reduce((acc, p) => acc + p.stock_available, 0),
    lowStock: activeProducts.filter((p) => p.low_stock && p.stock_available > 0).length,
    outOfStock: activeProducts.filter((p) => p.stock_available <= 0).length,
  };

  const formatNumber = (n: number) => n.toLocaleString("pt-BR");

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary" />
          Estoque / WMS
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visão consolidada de estoque, alertas e movimentações
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-primary mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium">Produtos</span></div>
          <p className="font-display text-xl font-bold text-foreground">{stats.totalProducts}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-info mb-1"><Boxes className="w-4 h-4" /><span className="text-xs font-medium">Total</span></div>
          <p className="font-display text-xl font-bold text-foreground">{formatNumber(stats.totalUnits)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-accent mb-1"><ArrowUpDown className="w-4 h-4" /><span className="text-xs font-medium">Reservado</span></div>
          <p className="font-display text-xl font-bold text-foreground">{formatNumber(stats.totalReserved)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-success mb-1"><CheckCircle2 className="w-4 h-4" /><span className="text-xs font-medium">Disponível</span></div>
          <p className="font-display text-xl font-bold text-foreground">{formatNumber(stats.totalAvailable)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-warning mb-1"><TrendingDown className="w-4 h-4" /><span className="text-xs font-medium">Baixo</span></div>
          <p className="font-display text-xl font-bold text-foreground">{stats.lowStock}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-destructive mb-1"><AlertTriangle className="w-4 h-4" /><span className="text-xs font-medium">Zerado</span></div>
          <p className="font-display text-xl font-bold text-foreground">{stats.outOfStock}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou SKU..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-[170px]">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filtro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="low">Estoque Baixo</SelectItem>
            <SelectItem value="out">Sem Estoque</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[170px]">
            <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Menor disponível</SelectItem>
            <SelectItem value="name">Nome A-Z</SelectItem>
            <SelectItem value="min">Estoque mínimo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Boxes className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Produto</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">SKU</th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-medium">Total</th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-medium">Reservado</th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-medium">Disponível</th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-medium">Mínimo</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const isOut = product.stock_available <= 0;
                  const isLow = product.low_stock && !isOut;
                  return (
                    <tr key={product.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {product.images.length > 0 ? (
                            <img src={product.images[0]} alt="" className="w-9 h-9 rounded-lg object-cover border border-border" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-foreground block">{product.name}</span>
                            {product.brand && <span className="text-xs text-muted-foreground">{product.brand}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs bg-secondary/50 px-2 py-0.5 rounded text-foreground">{product.sku}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-foreground">{product.stock_quantity}</td>
                      <td className="py-3 px-4 text-center text-muted-foreground">{product.stock_reserved}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-bold ${isOut ? "text-destructive" : isLow ? "text-warning" : "text-success"}`}>
                          {product.stock_available}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-muted-foreground">{product.stock_min}</td>
                      <td className="py-3 px-4">
                        {isOut ? (
                          <StatusBadge status="error" label="Sem Estoque" />
                        ) : isLow ? (
                          <StatusBadge status="pending" label="Baixo" />
                        ) : (
                          <StatusBadge status="active" label="OK" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setStockDialog(product)}
                          className="h-8 px-3 rounded-lg border border-input text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                        >
                          Ajustar
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

      <StockDialog
        open={!!stockDialog}
        onOpenChange={(open) => !open && setStockDialog(null)}
        product={stockDialog}
        onSubmit={updateStock}
      />
    </div>
  );
};

export default Estoque;
