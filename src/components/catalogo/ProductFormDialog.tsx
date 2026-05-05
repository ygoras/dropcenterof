import { useState, useEffect, useRef } from "react";
import { Package, Save, AlertTriangle, Truck, Info, Search, Loader2 } from "lucide-react";
import { ProductImageUpload } from "./ProductImageUpload";
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
import type { ProductCategory, ProductWithStock, ItemCondition } from "@/types/catalog";
import { api } from "@/lib/apiClient";

interface MlAttr {
  id: string;
  name: string;
  type: string;
  required: boolean;
  tooltip: string | null;
  values: Array<{ id: string; name: string }>;
  default_value: string | null;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategory[];
  product?: ProductWithStock | null;
  onSubmit: (data: {
    sku: string;
    name: string;
    description?: string;
    brand?: string;
    category_id?: string;
    cost_price: number;
    sell_price: number;
    weight_kg?: number;
    dimensions?: { length: number; width: number; height: number };
    images?: string[];
    status?: "active" | "inactive" | "draft";
    ml_category_id?: string;
    initial_stock?: number;
    min_stock?: number;
    condition?: ItemCondition;
    gtin?: string;
    warranty_type?: string;
    warranty_time?: string;
    attributes?: Record<string, unknown>;
  }) => Promise<boolean>;
}

export function ProductFormDialog({ open, onOpenChange, categories, product, onSubmit }: ProductFormDialogProps) {
  const isEdit = !!product;

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [logisticsCost, setLogisticsCost] = useState("0");
  const [weightKg, setWeightKg] = useState("");
  const [dimLength, setDimLength] = useState("");
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "draft">("active");
  const [initialStock, setInitialStock] = useState("");
  const [minStock, setMinStock] = useState("5");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [condition, setCondition] = useState<ItemCondition>("new");
  const [availableQty, setAvailableQty] = useState("1");
  const [warrantyType, setWarrantyType] = useState("Garantia do vendedor");
  const [warrantyTime, setWarrantyTime] = useState("90 dias");

  // ML Category & Attributes
  const [mlCategorySearch, setMlCategorySearch] = useState("");
  const [mlCategories, setMlCategories] = useState<Array<{ id: string; name: string; path?: string }>>([]);
  const [selectedMlCategory, setSelectedMlCategory] = useState<{ id: string; name: string; path?: string } | null>(null);
  const [mlAttributes, setMlAttributes] = useState<MlAttr[]>([]);
  const [mlAttrValues, setMlAttrValues] = useState<Record<string, string>>({});
  const [searchingMlCats, setSearchingMlCats] = useState(false);
  const [loadingMlAttrs, setLoadingMlAttrs] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open && product) {
      setSku(product.sku);
      setName(product.name);
      setDescription(product.description || "");
      setBrand(product.brand || "");
      setCategoryId(product.category_id || "");
      setCostPrice(String(product.cost_price));
      setSellPrice(String(product.sell_price));
      setLogisticsCost(String((product as any).logistics_cost ?? 0));
      setWeightKg(product.weight_kg ? String(product.weight_kg) : "");
      const dims = product.dimensions as { length?: number; width?: number; height?: number } | null;
      setDimLength(dims?.length ? String(dims.length) : "");
      setDimWidth(dims?.width ? String(dims.width) : "");
      setDimHeight(dims?.height ? String(dims.height) : "");
      setStatus(product.status);
      setImages(product.images || []);
      setInitialStock(String(product.stock_quantity));
      setMinStock(String(product.stock_min));
      setCondition(product.condition || "new");
      setAvailableQty(String((product.attributes as any)?._available_quantity || 1));
      setWarrantyType(product.warranty_type || "Garantia do vendedor");
      setWarrantyTime(product.warranty_time || "90 dias");

      // Restore ML category & attributes from product
      const attrs = (product.attributes || {}) as Record<string, unknown>;
      const mlCatId = product.ml_category_id || (attrs._ml_category_id as string) || "";
      const mlCatName = (attrs._ml_category_name as string) || "";
      if (mlCatId) {
        setSelectedMlCategory({ id: mlCatId, name: mlCatName || mlCatId });
        fetchMlAttributes(mlCatId);
      } else {
        setSelectedMlCategory(null);
        setMlAttributes([]);
      }
      // Restore saved attribute values
      const savedAttrs: Record<string, string> = {};
      for (const [key, val] of Object.entries(attrs)) {
        if (!key.startsWith("_")) {
          savedAttrs[key] = String(val);
        }
      }
      setMlAttrValues(savedAttrs);
    } else if (open) {
      setSku("");
      setName("");
      setDescription("");
      setBrand("");
      setCategoryId("");
      setCostPrice("");
      setSellPrice("");
      setLogisticsCost("0");
      setWeightKg("");
      setDimLength("");
      setDimWidth("");
      setDimHeight("");
      setStatus("active");
      setImages([]);
      setInitialStock("0");
      setMinStock("5");
      setCondition("new");
      setAvailableQty("1");
      setWarrantyType("Garantia do vendedor");
      setWarrantyTime("90 dias");
      setSelectedMlCategory(null);
      setMlCategories([]);
      setMlAttributes([]);
      setMlAttrValues({});
      setMlCategorySearch("");
    }
  }, [open, product]);

  const searchMlCategories = async (query: string) => {
    if (!query || query.length < 3) {
      setMlCategories([]);
      return;
    }
    setSearchingMlCats(true);
    try {
      const result = await api.get<{ categories: Array<{ id: string; name: string; path?: string }> }>(
        `/api/ml/categories?action=search&q=${encodeURIComponent(query)}`
      );
      if (result?.categories) {
        setMlCategories(result.categories);
      }
    } catch (err) {
      console.error("Error searching ML categories:", err);
    } finally {
      setSearchingMlCats(false);
    }
  };

  const fetchMlAttributes = async (categoryId: string) => {
    setLoadingMlAttrs(true);
    try {
      const result = await api.get<{ attributes: MlAttr[] }>(
        `/api/ml/categories?action=attributes&category_id=${encodeURIComponent(categoryId)}`
      );
      if (result?.attributes) {
        setMlAttributes(result.attributes);
      }
    } catch (err) {
      console.error("Error fetching ML attributes:", err);
    } finally {
      setLoadingMlAttrs(false);
    }
  };

  const handleMlCategorySearch = (value: string) => {
    setMlCategorySearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchMlCategories(value);
    }, 400);
  };

  const handleSelectMlCategory = (cat: { id: string; name: string; path?: string }) => {
    setSelectedMlCategory(cat);
    setMlCategories([]);
    setMlCategorySearch("");
    setMlAttrValues({});
    fetchMlAttributes(cat.id);
  };

  const handleSubmit = async () => {
    if (!sku.trim() || !name.trim()) return;
    setSubmitting(true);

    const l = parseFloat(dimLength) || 0;
    const w = parseFloat(dimWidth) || 0;
    const h = parseFloat(dimHeight) || 0;
    const hasDims = l > 0 && w > 0 && h > 0;

    // Build attributes object with ML attr values + internal metadata
    const attributes: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(mlAttrValues)) {
      if (val.trim()) attributes[key] = val.trim();
    }
    // Store ML category info as internal fields
    if (selectedMlCategory) {
      attributes._ml_category_id = selectedMlCategory.id;
      attributes._ml_category_name = selectedMlCategory.name;
    }
    attributes._available_quantity = parseInt(availableQty) || 1;

    const ok = await onSubmit({
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      brand: undefined,
      category_id: undefined,
      cost_price: parseFloat(costPrice) || 0,
      sell_price: parseFloat(sellPrice) || 0,
      logistics_cost: parseFloat(logisticsCost) || 0,
      weight_kg: parseFloat(weightKg) || undefined,
      dimensions: hasDims ? { length: l, width: w, height: h } : undefined,
      images,
      status,
      ml_category_id: selectedMlCategory?.id || undefined,
      initial_stock: parseInt(initialStock) || 0,
      min_stock: parseInt(minStock) || 5,
      condition,
      gtin: undefined,
      warranty_type: warrantyType || undefined,
      warranty_time: warrantyTime || undefined,
      attributes,
    });
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  const margin = (parseFloat(sellPrice) || 0) - (parseFloat(costPrice) || 0);
  const marginPct = (parseFloat(costPrice) || 0) > 0 ? ((margin / (parseFloat(costPrice) || 1)) * 100).toFixed(1) : "0";

  // ML readiness checks
  const hasWeight = !!weightKg && parseFloat(weightKg) > 0;
  const hasDims = !!dimLength && !!dimWidth && !!dimHeight && parseFloat(dimLength) > 0 && parseFloat(dimWidth) > 0 && parseFloat(dimHeight) > 0;
  const hasImages = images.length > 0;
  const hasDescription = !!description.trim();

  const mlIssues: string[] = [];
  if (!hasWeight) mlIssues.push("Peso não informado");
  if (!hasDims) mlIssues.push("Dimensões incompletas");
  if (!hasImages) mlIssues.push("Sem imagens");
  if (!hasDescription) mlIssues.push("Sem descrição");
  if (!selectedMlCategory) mlIssues.push("Categoria ML não selecionada");

  // Check required ML attributes
  const missingRequiredAttrs = mlAttributes.filter(a => a.required && !mlAttrValues[a.id]?.trim());
  if (missingRequiredAttrs.length > 0) {
    mlIssues.push(`${missingRequiredAttrs.length} atributo(s) ML obrigatório(s) pendente(s)`);
  }

  const inputClass = "w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {isEdit ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize as informações do produto." : "Adicione um novo produto ao catálogo master."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Row: SKU + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">SKU *</label>
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="EX: DROP-001" className={inputClass} disabled={isEdit} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Nome do Produto *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Produto + Marca + Modelo + Especificações" maxLength={60} className={inputClass} />
            <div className="flex justify-between mt-0.5">
              <p className="text-[10px] text-muted-foreground">Estrutura ML: Produto + Marca + Modelo + Especificações (máx. 60 caracteres)</p>
              <p className={`text-[10px] ${name.length > 50 ? "text-warning" : "text-muted-foreground"}`}>{name.length}/60</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição detalhada do produto para anúncios no Mercado Livre."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
            />
          </div>

          {/* Images */}
          <div>
            <ProductImageUpload images={images} onChange={setImages} />
            <p className="text-[10px] text-muted-foreground mt-1">
              ML aceita até 12 imagens. Recomendado: 1200×1200px, fundo branco.
            </p>
          </div>

          {/* ML Category & Attributes Section */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">Categoria do Mercado Livre *</p>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-1">
              Selecione a categoria ML para carregar os atributos obrigatórios do anúncio.
            </p>

            {selectedMlCategory ? (
              <div className="p-2.5 rounded-lg bg-success/5 border border-success/20 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedMlCategory.name}</p>
                  {selectedMlCategory.path && (
                    <p className="text-[10px] text-muted-foreground">{selectedMlCategory.path}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{selectedMlCategory.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMlCategory(null);
                    setMlAttributes([]);
                    setMlAttrValues({});
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Alterar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={mlCategorySearch}
                    onChange={(e) => handleMlCategorySearch(e.target.value)}
                    placeholder="Buscar categoria ML... ex: farol automotivo, celular"
                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {searchingMlCats && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                  )}
                </div>

                {mlCategories.length > 0 && (
                  <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                    {mlCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectMlCategory(cat)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">{cat.name}</p>
                        {cat.path && <p className="text-[10px] text-muted-foreground mt-0.5">{cat.path}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ML Attributes */}
            {loadingMlAttrs && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Carregando atributos obrigatórios...
              </div>
            )}

            {mlAttributes.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">Atributos da Categoria</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {mlAttributes.filter(a => a.required).length} obrigatórios
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mlAttributes.map((attr) => {
                    const isEmpty = !mlAttrValues[attr.id]?.trim();
                    const isRequired = attr.required;
                    return (
                      <div key={attr.id}>
                        <label className={`text-xs font-medium mb-1 block ${isRequired && isEmpty ? "text-warning" : "text-muted-foreground"}`}>
                          {attr.name}
                          {isRequired && <span className="text-destructive ml-0.5">*</span>}
                        </label>

                        {attr.values.length > 0 ? (
                          <Select
                            value={mlAttrValues[attr.id] || ""}
                            onValueChange={(v) => setMlAttrValues(prev => ({ ...prev, [attr.id]: v }))}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder={`Selecione...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {attr.values.map((v) => (
                                <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <input
                            type={attr.type === "number" ? "number" : "text"}
                            value={mlAttrValues[attr.id] || ""}
                            onChange={(e) => setMlAttrValues(prev => ({ ...prev, [attr.id]: e.target.value }))}
                            placeholder={attr.tooltip || `Informe ${attr.name.toLowerCase()}`}
                            className={`w-full h-9 px-3 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 border-input focus:ring-ring`}
                          />
                        )}

                        {attr.tooltip && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{attr.tooltip}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Condition */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Condição *</label>
            <Select value={condition} onValueChange={(v) => setCondition(v as ItemCondition)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="used">Usado</SelectItem>
                <SelectItem value="refurbished">Recondicionado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Custo (R$)</label>
              <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" className={inputClass} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Inclui logística</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Logística (R$)</label>
              <input type="number" step="0.01" value={logisticsCost} onChange={(e) => setLogisticsCost(e.target.value)} placeholder="0.00" className={inputClass} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Embutida no custo</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Venda (R$) *</label>
              <input type="number" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Margem</label>
              <div className={`h-10 px-3 rounded-lg border border-input bg-secondary/50 flex items-center text-sm font-semibold ${margin >= 0 ? "text-success" : "text-destructive"}`}>
                {margin >= 0 ? "+" : ""}{marginPct}%
              </div>
            </div>
          </div>

          {/* Shipping / Dimensions Section */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">Envio — Dimensões e Peso</p>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-1">
              Obrigatório para calcular frete via Mercado Envios (ME2).
            </p>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Comprimento (cm)</label>
                <input type="number" step="0.1" min="0" value={dimLength} onChange={(e) => setDimLength(e.target.value)} placeholder="0" className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Largura (cm)</label>
                <input type="number" step="0.1" min="0" value={dimWidth} onChange={(e) => setDimWidth(e.target.value)} placeholder="0" className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Altura (cm)</label>
                <input type="number" step="0.1" min="0" value={dimHeight} onChange={(e) => setDimHeight(e.target.value)} placeholder="0" className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Peso (kg)</label>
                <input type="number" step="0.001" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="0.000" className={inputClass} />
              </div>
            </div>

            {hasDims && hasWeight && (
              <div className="flex items-center gap-2 text-[10px] text-success">
                <Info className="w-3 h-3" />
                Dimensões ML: {dimHeight}×{dimWidth}×{dimLength},{Math.round((parseFloat(weightKg) || 0) * 1000)}g
              </div>
            )}

            {(!hasDims || !hasWeight) && (
              <div className="flex items-center gap-1.5 text-[10px] text-warning">
                <AlertTriangle className="w-3 h-3" />
                {!hasDims && !hasWeight
                  ? "Informe dimensões e peso para habilitar cálculo automático de frete"
                  : !hasDims
                  ? "Informe todas as 3 dimensões (CxLxA)"
                  : "Informe o peso do produto"}
              </div>
            )}
          </div>

          {/* Warranty */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border">
            <p className="text-xs font-semibold text-foreground mb-2">Garantia (sale_terms ML)</p>
            {condition === "refurbished" && (
              <div className="mb-2 p-2 rounded bg-warning/10 border border-warning/20">
                <p className="text-[10px] text-warning font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Produtos recondicionados exigem garantia mínima de 90 dias no ML
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de Garantia</label>
                <Select value={warrantyType} onValueChange={setWarrantyType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Garantia do vendedor">Garantia do vendedor</SelectItem>
                    <SelectItem value="Garantia de fábrica">Garantia de fábrica</SelectItem>
                    <SelectItem value="Sem garantia">Sem garantia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tempo de Garantia</label>
                <Select value={warrantyTime} onValueChange={setWarrantyTime}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 dias">30 dias</SelectItem>
                    <SelectItem value="60 dias">60 dias</SelectItem>
                    <SelectItem value="90 dias">90 dias</SelectItem>
                    <SelectItem value="6 meses">6 meses</SelectItem>
                    <SelectItem value="1 anos">1 ano</SelectItem>
                    <SelectItem value="2 anos">2 anos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ML Category section already rendered above */}

          {/* Stock & Quantity */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border">
            <p className="text-xs font-semibold text-foreground mb-2">Estoque & Quantidade para Anúncio</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Qtd. para Anúncio ML</label>
                <input type="number" value={availableQty} onChange={(e) => setAvailableQty(e.target.value)} placeholder="1" className={inputClass} />
                <p className="text-[10px] text-muted-foreground mt-0.5">Quantidade exibida no ML</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Estoque interno</label>
                <input type="number" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} placeholder="0" className={inputClass} />
                <p className="text-[10px] text-muted-foreground mt-0.5">Controle interno</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Estoque mínimo</label>
                <input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="5" className={inputClass} />
                <p className="text-[10px] text-muted-foreground mt-0.5">Alerta de reposição</p>
              </div>
            </div>
          </div>

          {/* ML Readiness Indicator */}
          {mlIssues.length > 0 && (
            <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <p className="text-xs font-semibold text-warning">Itens pendentes para anúncio ML</p>
              </div>
              <ul className="space-y-0.5">
                {mlIssues.map((issue) => (
                  <li key={issue} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-warning flex-shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Estes campos são recomendados para um anúncio completo. O produto pode ser salvo sem eles.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 h-10 rounded-lg border border-input text-foreground text-sm font-medium hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !sku.trim() || !name.trim()}
              className="flex-1 h-10 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEdit ? "Salvar" : "Criar Produto"}
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
