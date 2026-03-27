import { useState, useRef } from "react";
import {
  Plus,
  Search,
  AlertTriangle,
  Calculator,
  Truck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMlCategories } from "@/hooks/useMlCategories";
import { MlPriceCalculator } from "@/components/ml/MlPriceCalculator";
import type { ProductWithStock } from "@/types/catalog";

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProducts: ProductWithStock[];
  stores: Array<{ id: string; store_name: string | null; ml_nickname: string | null }>;
  onCreateListing: (data: {
    product_id: string;
    title: string;
    price: number;
    category_id?: string;
    attributes: Record<string, unknown>;
    ml_credential_id?: string;
  }) => Promise<void>;
  formatCurrency: (v: number) => string;
}

export function CreateListingDialog({
  open,
  onOpenChange,
  activeProducts,
  stores,
  onCreateListing,
  formatCurrency,
}: CreateListingDialogProps) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState(stores.length === 1 ? stores[0].id : "");
  const [listingTitle, setListingTitle] = useState("");
  const [listingPrice, setListingPrice] = useState("");
  const [listingType, setListingType] = useState("gold_pro");
  const [creating, setCreating] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const categoryDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [showCalculator, setShowCalculator] = useState(false);
  const [freeShipping, setFreeShipping] = useState(false);

  const {
    categories: mlCategories,
    attributes: mlAttributes,
    selectedCategory,
    searchingCategories,
    loadingAttributes,
    searchCategories,
    selectCategory,
    clearCategory,
  } = useMlCategories();

  const handleSelectProduct = (productId: string) => {
    setSelectedProduct(productId);
    const product = activeProducts.find((p) => p.id === productId);
    if (product) {
      setListingTitle(product.name);
      setListingPrice(product.sell_price.toString());
    }
  };

  const handleCategorySearch = (value: string) => {
    setCategorySearch(value);
    if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
    categoryDebounceRef.current = setTimeout(() => {
      searchCategories(value);
    }, 400);
  };

  const handleAttributeChange = (attrId: string, value: string) => {
    setAttributeValues((prev) => ({ ...prev, [attrId]: value }));
  };

  const missingRequiredAttrs = mlAttributes.filter((a) => a.required && !attributeValues[a.id]?.trim());

  const isFormValid =
    !!selectedProduct &&
    !!selectedStore &&
    listingTitle.trim().length > 0 &&
    !!listingPrice &&
    parseFloat(listingPrice) > 0 &&
    missingRequiredAttrs.length === 0;

  const handleCreate = async () => {
    setAttempted(true);
    if (!isFormValid) return;
    setCreating(true);

    const attrs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(attributeValues)) {
      if (val) attrs[key] = val;
    }

    const selectedProd = activeProducts.find((p) => p.id === selectedProduct);

    await onCreateListing({
      product_id: selectedProduct,
      title: listingTitle,
      price: parseFloat(listingPrice),
      category_id: selectedCategory?.id,
      ml_credential_id: selectedStore || undefined,
      attributes: {
        ...attrs,
        _listing_type_id: listingType,
        _condition: selectedProd?.condition || "new",
        _warranty_type: selectedProd?.warranty_type || "Garantia do vendedor",
        _warranty_time: selectedProd?.warranty_time || "90 dias",
        _brand: selectedProd?.brand || undefined,
        _seller_sku: selectedProd?.sku || undefined,
        _free_shipping: freeShipping,
      },
    });

    setCreating(false);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setAttempted(false);
    setSelectedProduct("");
    setSelectedStore(stores.length === 1 ? stores[0].id : "");
    setListingTitle("");
    setListingPrice("");
    setListingType("gold_pro");
    setCategorySearch("");
    setAttributeValues({});
    setFreeShipping(false);
    clearCategory();
  };

  const selectedProd = activeProducts.find((p) => p.id === selectedProduct);

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) { clearCategory(); setAttributeValues({}); setCategorySearch(""); }
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Novo Anúncio</DialogTitle>
          <DialogDescription>Selecione um produto, categoria ML e preencha os atributos obrigatórios</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Product */}
          <div>
            <label className={`text-xs font-medium mb-1.5 block ${attempted && !selectedProduct ? "text-destructive" : "text-muted-foreground"}`}>
              Produto <span className="text-destructive">*</span>
            </label>
            <Select value={selectedProduct} onValueChange={handleSelectProduct}>
              <SelectTrigger className={attempted && !selectedProduct ? "border-destructive ring-destructive/30 ring-2" : ""}>
                <SelectValue placeholder="Selecione um produto..." />
              </SelectTrigger>
              <SelectContent>
                {activeProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {attempted && !selectedProduct && (
              <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Selecione um produto</p>
            )}
          </div>

          {/* Store Selector */}
          {stores.length > 1 && (
            <div>
              <label className={`text-xs font-medium mb-1.5 block ${attempted && !selectedStore ? "text-destructive" : "text-muted-foreground"}`}>
                Loja ML <span className="text-destructive">*</span>
              </label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className={attempted && !selectedStore ? "border-destructive ring-destructive/30 ring-2" : ""}>
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.store_name || s.ml_nickname || "Loja sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {attempted && !selectedStore && (
                <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Selecione uma loja</p>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className={`text-xs font-medium mb-1.5 block ${attempted && !listingTitle.trim() ? "text-destructive" : "text-muted-foreground"}`}>
              Título do Anúncio <span className="text-destructive">*</span>
            </label>
            <input type="text" value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} placeholder="Título que aparecerá no ML..." maxLength={60}
              className={`w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 ${attempted && !listingTitle.trim() ? "border-destructive ring-destructive/30 ring-2" : "border-input focus:ring-ring"}`}
            />
            <div className="flex justify-between mt-0.5">
              {attempted && !listingTitle.trim() ? (
                <p className="text-[10px] text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Informe o título</p>
              ) : <span />}
              <p className="text-[10px] text-muted-foreground">{listingTitle.length}/60 caracteres</p>
            </div>
          </div>

          {/* Price */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`text-xs font-medium ${attempted && (!listingPrice || parseFloat(listingPrice) <= 0) ? "text-destructive" : "text-muted-foreground"}`}>
                Preço (R$) <span className="text-destructive">*</span>
              </label>
              {selectedProduct && (
                <button type="button" onClick={() => setShowCalculator(!showCalculator)} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  <Calculator className="w-3 h-3" />
                  {showCalculator ? "Ocultar calculadora" : "Usar calculadora de preço"}
                </button>
              )}
            </div>
            {showCalculator && selectedProd ? (
              <div className="mb-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <MlPriceCalculator
                  basePrice={selectedProd.cost_price}
                  onFinalPriceChange={(price) => setListingPrice(price.toFixed(2))}
                  compact
                  listingType={listingType}
                  onFreeShippingChange={setFreeShipping}
                  productDimensions={selectedProd.dimensions as { length: number; width: number; height: number } | null}
                  productWeightKg={selectedProd.weight_kg || null}
                  productCondition={selectedProd.condition || "new"}
                />
              </div>
            ) : (
              <>
                <input type="number" step="0.01" value={listingPrice} onChange={(e) => setListingPrice(e.target.value)}
                  className={`w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 ${attempted && (!listingPrice || parseFloat(listingPrice) <= 0) ? "border-destructive ring-destructive/30 ring-2" : "border-input focus:ring-ring"}`}
                />
                {attempted && (!listingPrice || parseFloat(listingPrice) <= 0) && (
                  <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Informe um preço válido</p>
                )}
              </>
            )}
          </div>

          {/* Listing Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de Anúncio</label>
            <Select value={listingType} onValueChange={setListingType}>
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gold_pro">
                  <div className="flex items-center justify-between w-full gap-3"><span>Premium</span><span className="text-[10px] text-muted-foreground">Máx. visibilidade</span></div>
                </SelectItem>
                <SelectItem value="gold_special">
                  <div className="flex items-center justify-between w-full gap-3"><span>Clássica</span><span className="text-[10px] text-muted-foreground">Boa visibilidade</span></div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {listingType === "gold_pro" && "Premium: maior exposição e destaque em buscas"}
              {listingType === "gold_special" && "Clássica: boa exposição, sem frete grátis obrigatório"}
            </p>
            {!showCalculator && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} className="w-4 h-4 rounded border-input accent-primary" />
                <Truck className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Anunciar com Frete Grátis</span>
              </label>
            )}
            {freeShipping && !showCalculator && (
              <p className="text-[10px] text-muted-foreground mt-1 ml-6">O custo do frete será absorvido por você. Use a calculadora de preço para embutir o frete no valor.</p>
            )}
          </div>

          {/* Product Info Summary */}
          {selectedProd && (
            <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2.5">
              <p className="font-semibold text-foreground text-xs">Dados do Produto para ML</p>
              {selectedProd.images && selectedProd.images.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {selectedProd.images.map((img, i) => (
                    <img key={i} src={img} alt={`Imagem ${i + 1}`} className="w-12 h-12 rounded border border-border object-cover flex-shrink-0" />
                  ))}
                  <span className="text-[10px] text-muted-foreground self-end ml-1">{selectedProd.images.length} imagem(ns)</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Condição:</span>
                <span className="text-foreground font-medium">{selectedProd.condition === "new" ? "Novo" : selectedProd.condition === "used" ? "Usado" : "Recondicionado"}</span>
                <span className="text-muted-foreground">Marca:</span>
                <span className="text-foreground font-medium">{selectedProd.brand || "—"}</span>
                <span className="text-muted-foreground">Garantia:</span>
                <span className="text-foreground font-medium">{selectedProd.warranty_type || "—"} ({selectedProd.warranty_time || "—"})</span>
                <span className="text-muted-foreground">SKU:</span>
                <span className="text-foreground font-medium font-mono">{selectedProd.sku}</span>
                <span className="text-muted-foreground">Preço Custo:</span>
                <span className="text-foreground font-medium">{formatCurrency(selectedProd.cost_price)}</span>
                <span className="text-muted-foreground">Preço Venda:</span>
                <span className="text-foreground font-medium">{formatCurrency(selectedProd.sell_price)}</span>
                {selectedProd.weight_kg && (<><span className="text-muted-foreground">Peso:</span><span className="text-foreground font-medium">{selectedProd.weight_kg} kg</span></>)}
                {selectedProd.dimensions && (<><span className="text-muted-foreground">Dimensões (CxLxA):</span><span className="text-foreground font-medium">{(selectedProd.dimensions as any).length}×{(selectedProd.dimensions as any).width}×{(selectedProd.dimensions as any).height} cm</span></>)}
                {(!selectedProd.weight_kg || !selectedProd.dimensions) && (
                  <span className="text-warning text-[10px] col-span-2 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {!selectedProd.weight_kg && !selectedProd.dimensions ? "Peso e dimensões não informados — necessários para cálculo de frete" : !selectedProd.weight_kg ? "Peso não informado — necessário para cálculo de frete" : "Dimensões não informadas — necessárias para cálculo de frete"}
                  </span>
                )}
              </div>
              {selectedProd.description && (
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground font-medium">Ver descrição completa</summary>
                  <p className="mt-1.5 p-2 rounded bg-background border border-border text-foreground whitespace-pre-wrap text-[11px] max-h-32 overflow-y-auto">{selectedProd.description}</p>
                </details>
              )}
            </div>
          )}

          {/* Category Search */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Categoria do Mercado Livre
              {selectedCategory && (
                <button onClick={() => { clearCategory(); setCategorySearch(""); }} className="ml-2 text-primary hover:underline">Alterar</button>
              )}
            </label>
            {selectedCategory ? (
              <div className="p-3 rounded-lg bg-success/5 border border-success/20">
                <p className="text-sm font-medium text-foreground">{selectedCategory.name}</p>
                {selectedCategory.path && <p className="text-[10px] text-muted-foreground mt-0.5">{selectedCategory.path}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={categorySearch} onChange={(e) => handleCategorySearch(e.target.value)} placeholder="Buscar categoria... ex: celular, camiseta, notebook"
                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {searchingCategories && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {mlCategories.length > 0 && (
                  <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                    {mlCategories.map((cat) => (
                      <button key={cat.id} onClick={() => selectCategory(cat)} className="w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors">
                        <p className="text-sm font-medium text-foreground">{cat.name}</p>
                        {cat.path && <p className="text-[10px] text-muted-foreground mt-0.5">{cat.path}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Required Attributes */}
          {loadingAttributes && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Carregando atributos da categoria...
            </div>
          )}
          {mlAttributes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Atributos da Categoria</span>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{mlAttributes.filter((a) => a.required).length} obrigatórios</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mlAttributes.map((attr) => {
                  const isEmpty = !attributeValues[attr.id]?.trim();
                  const showError = attempted && attr.required && isEmpty;
                  return (
                    <div key={attr.id}>
                      <label className={`text-xs font-medium mb-1 block ${showError ? "text-destructive" : "text-muted-foreground"}`}>
                        {attr.name}{attr.required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      {attr.values.length > 0 ? (
                        <Select value={attributeValues[attr.id] || ""} onValueChange={(v) => handleAttributeChange(attr.id, v)}>
                          <SelectTrigger className={`h-9 text-sm ${showError ? "border-destructive ring-destructive/30 ring-2" : ""}`}>
                            <SelectValue placeholder={`Selecione ${attr.name.toLowerCase()}...`} />
                          </SelectTrigger>
                          <SelectContent>
                            {attr.values.map((v) => (<SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <input type={attr.type === "number" ? "number" : "text"} value={attributeValues[attr.id] || ""} onChange={(e) => handleAttributeChange(attr.id, e.target.value)} placeholder={attr.tooltip || `Informe ${attr.name.toLowerCase()}`}
                          className={`w-full h-9 px-3 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 ${showError ? "border-destructive ring-destructive/30 ring-2" : "border-input focus:ring-ring"}`}
                        />
                      )}
                      {showError ? (
                        <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Campo obrigatório</p>
                      ) : attr.tooltip ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{attr.tooltip}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Validation summary */}
          {attempted && !isFormValid && (
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-xs text-destructive space-y-0.5">
                {!selectedProduct && <p>Selecione um produto</p>}
                {!listingTitle.trim() && <p>Informe o título do anúncio</p>}
                {(!listingPrice || parseFloat(listingPrice) <= 0) && <p>Informe um preço válido</p>}
                {missingRequiredAttrs.length > 0 && (
                  <p>Preencha {missingRequiredAttrs.length} atributo{missingRequiredAttrs.length > 1 ? "s" : ""} obrigatório{missingRequiredAttrs.length > 1 ? "s" : ""}: <strong>{missingRequiredAttrs.map((a) => a.name).join(", ")}</strong></p>
                )}
              </div>
            </div>
          )}

          <button onClick={handleCreate} disabled={creating}
            className={`w-full h-10 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-opacity ${attempted && !isFormValid ? "bg-destructive/80 text-destructive-foreground hover:bg-destructive/70" : "gradient-primary text-primary-foreground hover:opacity-90"} disabled:opacity-50`}
          >
            {creating ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? "Criando..." : "Criar Anúncio"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">O anúncio será salvo como rascunho com a categoria e atributos selecionados.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
