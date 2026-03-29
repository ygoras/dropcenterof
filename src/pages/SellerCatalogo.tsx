import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import {
  Package,
  Search,
  ShoppingCart,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Tag,
  Truck,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useProducts } from "@/hooks/useProducts";
import { useMlListings } from "@/hooks/useMlListings";
import { useMlCredentials } from "@/hooks/useMlCredentials";
import type { ProductWithStock } from "@/types/catalog";
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
import { MlPriceCalculator } from "@/components/ml/MlPriceCalculator";
import { Link } from "react-router-dom";
import { Store } from "lucide-react";

const SellerCatalogo = () => {
  const { products, categories, loading } = useProducts();
  const { createAndPublish } = useMlListings();
  const { isConnected } = useMlCredentials();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [detailProduct, setDetailProduct] = useState<ProductWithStock | null>(null);

  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const [listingType, setListingType] = useState("gold_pro");
  const [freeShipping, setFreeShipping] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Only show active products
  const availableProducts = products.filter((p) => p.status === "active");

  const filtered = availableProducts.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || p.category_id === categoryFilter;
    return matchSearch && matchCategory;
  });


  const handlePublish = async () => {
    if (!detailProduct || calculatedPrice <= 0 || publishing) return;

    setPublishing(true);
    try {
      await createAndPublish({
        product_id: detailProduct.id,
        title: detailProduct.name,
        price: Math.round(calculatedPrice * 100) / 100,
        listingType,
        freeShipping,
        condition: detailProduct.condition || "new",
        brand: detailProduct.brand || undefined,
        sku: detailProduct.sku,
        warranty_type: detailProduct.warranty_type || undefined,
        warranty_time: detailProduct.warranty_time || undefined,
        ml_category_id: detailProduct.ml_category_id || undefined,
      });
      setDetailProduct(null);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          Catálogo Disponível
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Escolha produtos do catálogo para anunciar automaticamente no Mercado Livre
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-primary mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium">Produtos Disponíveis</span></div>
          <p className="font-display text-xl font-bold text-foreground">{availableProducts.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-success mb-1"><CheckCircle2 className="w-4 h-4" /><span className="text-xs font-medium">Com Estoque</span></div>
          <p className="font-display text-xl font-bold text-foreground">{availableProducts.filter((p) => p.stock_available > 0).length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 text-accent mb-1"><Tag className="w-4 h-4" /><span className="text-xs font-medium">Categorias</span></div>
          <p className="font-display text-xl font-bold text-foreground">{categories.length}</p>
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
        {categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-medium">Nenhum produto disponível</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => {
            const hasStock = product.stock_available > 0;
            return (
              <div
                key={product.id}
                className="bg-card rounded-xl border border-border shadow-card overflow-hidden hover:shadow-elevated transition-shadow cursor-pointer group"
                onClick={() => setDetailProduct(product)}
              >
                <div className="aspect-square bg-secondary/30 relative overflow-hidden">
                  {product.images.length > 0 ? (
                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {!hasStock && (
                    <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
                      <span className="bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full">SEM ESTOQUE</span>
                    </div>
                  )}
                  {product.low_stock && hasStock && (
                    <div className="absolute top-2 right-2">
                      <span className="bg-warning text-warning-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> BAIXO
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  {product.category_name && (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">{product.category_name}</span>
                  )}
                  <h3 className="font-medium text-foreground text-sm mt-1 line-clamp-2 leading-tight">{product.name}</h3>
                  {product.brand && <p className="text-xs text-muted-foreground mt-0.5">{product.brand}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <p className="font-display text-lg font-bold text-foreground">{formatCurrency(product.sell_price)}</p>
                    <span className="text-xs text-muted-foreground">{product.stock_available} un.</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Detail + Price Calculator Dialog */}
      <Dialog open={!!detailProduct} onOpenChange={() => setDetailProduct(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{detailProduct?.name}</DialogTitle>
            <DialogDescription>SKU: {detailProduct?.sku} — Configure seu preço de venda no Mercado Livre</DialogDescription>
          </DialogHeader>
          {detailProduct && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left: Product Info */}
                <div className="space-y-3">
                  {detailProduct.images.length > 0 && (
                    <div className="aspect-square rounded-lg overflow-hidden border border-border">
                      <img src={detailProduct.images[0]} alt={detailProduct.name} className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Multiple images thumbnails */}
                  {detailProduct.images.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                      {detailProduct.images.map((img, i) => (
                        <img key={i} src={img} alt={`Imagem ${i + 1}`} className="w-10 h-10 rounded border border-border object-cover flex-shrink-0" />
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs block">Preço do Produto</span>
                      <span className="font-bold text-foreground">{formatCurrency(detailProduct.sell_price)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Estoque</span>
                      <span className={`font-bold ${detailProduct.stock_available > 0 ? "text-success" : "text-destructive"}`}>
                        {detailProduct.stock_available} un.
                      </span>
                    </div>
                    {detailProduct.brand && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Marca</span>
                        <span className="text-foreground">{detailProduct.brand}</span>
                      </div>
                    )}
                    {detailProduct.category_name && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Categoria</span>
                        <span className="text-foreground">{detailProduct.category_name}</span>
                      </div>
                    )}
                  </div>

                  {/* ML-specific fields */}
                  <div className="p-2.5 rounded-lg bg-secondary/30 border border-border space-y-1.5 text-xs">
                    <p className="font-semibold text-foreground text-[11px]">Informações para o Anúncio</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <span className="text-muted-foreground">Condição:</span>
                      <span className="text-foreground font-medium">
                        {detailProduct.condition === "new" ? "Novo" : detailProduct.condition === "used" ? "Usado" : "Recondicionado"}
                      </span>
                      <span className="text-muted-foreground">Garantia:</span>
                      <span className="text-foreground font-medium">{detailProduct.warranty_type || "—"} ({detailProduct.warranty_time || "—"})</span>
                      {detailProduct.weight_kg && (
                        <>
                          <span className="text-muted-foreground">Peso:</span>
                          <span className="text-foreground font-medium">{detailProduct.weight_kg} kg</span>
                        </>
                      )}
                      {detailProduct.dimensions && (
                        <>
                          <span className="text-muted-foreground">Dimensões:</span>
                          <span className="text-foreground font-medium">{detailProduct.dimensions.length}x{detailProduct.dimensions.width}x{detailProduct.dimensions.height} cm</span>
                        </>
                      )}
                    </div>
                  </div>

                  {detailProduct.description && (
                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer hover:text-foreground font-medium">Ver descrição completa</summary>
                      <p className="mt-1.5 p-2 rounded bg-background border border-border text-foreground whitespace-pre-wrap text-[11px] max-h-32 overflow-y-auto">
                        {detailProduct.description}
                      </p>
                    </details>
                  )}
                </div>

                {/* Right: Listing Type + Price Calculator */}
                <div className="space-y-3">
                  {/* Listing Type Selector */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de Anúncio</label>
                    <Select value={listingType} onValueChange={setListingType}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gold_pro">
                          <div className="flex items-center gap-2">
                            <span>Premium</span>
                            <span className="text-[10px] text-muted-foreground">~16.5%</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="gold_special">
                          <div className="flex items-center gap-2">
                            <span>Clássica</span>
                            <span className="text-[10px] text-muted-foreground">~12.5%</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {listingType === "gold_pro" && "Máxima visibilidade • Frete grátis acima de R$79 • Maior comissão"}
                      {listingType === "gold_special" && "Boa visibilidade • Menor comissão • Sem frete grátis obrigatório"}
                    </p>
                  </div>

                  <MlPriceCalculator
                    basePrice={detailProduct.cost_price}
                    onFinalPriceChange={(price) => setCalculatedPrice(price)}
                    onFreeShippingChange={setFreeShipping}
                    listingType={listingType}
                    productDimensions={detailProduct.dimensions as { length: number; width: number; height: number } | null}
                    productWeightKg={detailProduct.weight_kg}
                    productCondition={detailProduct.condition}
                    categoryId={detailProduct.ml_category_id}
                  />
                </div>
              </div>

              {/* Publish button */}
              {!isConnected ? (
                <div className="text-center space-y-2">
                  <p className="text-sm text-warning flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Conecte o Mercado Livre para anunciar
                  </p>
                  <Link
                    to="/seller/integracao"
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Store className="w-4 h-4" />
                    Ir para Integração
                  </Link>
                </div>
              ) : (
                <>
                  <button
                    onClick={handlePublish}
                    disabled={detailProduct.stock_available <= 0 || calculatedPrice <= 0 || publishing}
                    className="w-full h-12 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {publishing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Publicando no Mercado Livre...
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        {detailProduct.stock_available > 0
                          ? `Anunciar por ${formatCurrency(calculatedPrice)} no Mercado Livre`
                          : "Sem Estoque"}
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-muted-foreground text-center">
                    O anúncio será publicado automaticamente na sua conta do Mercado Livre com o preço calculado.
                  </p>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellerCatalogo;
