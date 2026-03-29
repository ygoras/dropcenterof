import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import {
  Tag,
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Boxes,
  AlertTriangle,
  Package,
  Filter,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useProducts } from "@/hooks/useProducts";
import { ProductFormDialog } from "@/components/catalogo/ProductFormDialog";
import { StockDialog } from "@/components/catalogo/StockDialog";
import type { ProductWithStock } from "@/types/catalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const statusConfig: Record<string, { label: string; status: "active" | "pending" | "error" }> = {
  active: { label: "Ativo", status: "active" },
  draft: { label: "Rascunho", status: "pending" },
  inactive: { label: "Inativo", status: "error" },
};

const Catalogo = () => {
  const { products, categories, loading, createProduct, updateProduct, deleteProduct, updateStock } = useProducts();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productDialog, setProductDialog] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductWithStock | null>(null);
  const [stockDialog, setStockDialog] = useState<ProductWithStock | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<ProductWithStock | null>(null);

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()) || (p.brand ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: products.length,
    active: products.filter((p) => p.status === "active").length,
    lowStock: products.filter((p) => p.low_stock && p.status === "active").length,
  };


  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" />
            Catálogo Master
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Produtos da plataforma para anúncio automático no Mercado Livre
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditProduct(null); setProductDialog(true); }}
            className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Novo Produto
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-primary mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium">Total</span></div>
          <p className="font-display text-xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-success mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium">Ativos</span></div>
          <p className="font-display text-xl font-bold text-foreground">{stats.active}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-warning mb-1"><AlertTriangle className="w-4 h-4" /><span className="text-xs font-medium">Estoque Baixo</span></div>
          <p className="font-display text-xl font-bold text-foreground">{stats.lowStock}</p>
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
            placeholder="Buscar por nome, SKU ou marca..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
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
            <Package className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Nenhum produto encontrado</p>
            <button
              onClick={() => { setEditProduct(null); setProductDialog(true); }}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Criar primeiro produto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Produto</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">SKU</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Categoria ML</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Custo</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Venda</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Estoque</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const config = statusConfig[product.status] ?? statusConfig.active;
                  const attrs = (product.attributes || {}) as Record<string, unknown>;
                  const mlCatName = (attrs._ml_category_name as string) || product.ml_category_id || "—";
                  return (
                    <tr key={product.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {product.images.length > 0 ? (
                            <img src={product.images[0]} alt="" className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center flex-shrink-0">
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
                      <td className="py-3 px-4 text-muted-foreground text-xs">{mlCatName}</td>
                      <td className="py-3 px-4 text-muted-foreground">{formatCurrency(product.cost_price)}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{formatCurrency(product.sell_price)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${product.low_stock ? "text-warning" : "text-foreground"}`}>
                            {product.stock_available}
                          </span>
                          {product.low_stock && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground">mín: {product.stock_min}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={config.status} label={config.label} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditProduct(product); setProductDialog(true); }}>
                              <Pencil className="w-4 h-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStockDialog(product)}>
                              <Boxes className="w-4 h-4 mr-2" /> Estoque
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteDialog(product)} className="text-destructive focus:text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ProductFormDialog
        open={productDialog}
        onOpenChange={setProductDialog}
        categories={categories}
        product={editProduct}
        onSubmit={async (data) => {
          if (editProduct) {
            const { initial_stock, min_stock, ...productData } = data;
            const updateData = { ...productData } as any;
            if (data.dimensions) {
              updateData.dimensions = data.dimensions;
            }
            const ok = await updateProduct(editProduct.id, updateData);
            if (ok && (initial_stock !== undefined || min_stock !== undefined)) {
              await updateStock(editProduct.id, { quantity: initial_stock, min_stock });
            }
            return ok;
          }
          return createProduct(data);
        }}
      />

      <StockDialog
        open={!!stockDialog}
        onOpenChange={(open) => !open && setStockDialog(null)}
        product={stockDialog}
        onSubmit={updateStock}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-destructive">Excluir Produto</DialogTitle>
            <DialogDescription>
              Excluir <strong>{deleteDialog?.name}</strong> (SKU: {deleteDialog?.sku})? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setDeleteDialog(null)} className="flex-1 h-10 rounded-lg border border-input text-foreground text-sm font-medium hover:bg-secondary transition-colors">Cancelar</button>
            <button
              onClick={async () => {
                if (deleteDialog) {
                  await deleteProduct(deleteDialog.id);
                  setDeleteDialog(null);
                }
              }}
              className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Excluir
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Catalogo;
