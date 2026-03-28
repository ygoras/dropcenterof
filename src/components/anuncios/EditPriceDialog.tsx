import { useState } from "react";
import { DollarSign, AlertTriangle, Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MlPriceCalculator } from "@/components/ml/MlPriceCalculator";
import { api } from "@/lib/apiClient";
import type { ProductWithStock } from "@/types/catalog";

interface EditPriceDialogProps {
  listingId: string | null;
  listings: Array<{
    id: string;
    title: string;
    price: number;
    product_id: string;
    category_id?: string | null;
    attributes?: Record<string, unknown> | null;
  }>;
  products: ProductWithStock[];
  onClose: () => void;
  onUpdatePrice: (id: string, price: number) => Promise<void>;
  formatCurrency: (v: number) => string;
}

export function EditPriceDialog({
  listingId,
  listings,
  products,
  onClose,
  onUpdatePrice,
  formatCurrency,
}: EditPriceDialogProps) {
  const [editPrice, setEditPrice] = useState("");
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [showEditCalculator, setShowEditCalculator] = useState(true);
  const [editFeeLoading, setEditFeeLoading] = useState(false);
  const [editMlFee, setEditMlFee] = useState<number | null>(null);

  const listing = listings.find((l) => l.id === listingId);
  const product = listing ? products.find((p) => p.id === listing.product_id) : null;
  const costPrice = product?.cost_price || 0;
  const listingTypeId = (listing?.attributes as any)?._listing_type_id || "gold_pro";
  const newPrice = parseFloat(editPrice) || 0;

  const fetchMlFees = async (price: number, categoryId: string, ltId: string) => {
    setEditFeeLoading(true);
    setEditMlFee(null);
    try {
      const data = await api.post<{ sale_fee_amount?: number }>("/api/ml/sync", {
        action: "get_fees", price, category_id: categoryId, listing_type_id: ltId,
      });
      if (data?.sale_fee_amount !== undefined) {
        setEditMlFee(data.sale_fee_amount);
      }
    } catch (err) {
      console.warn("Could not fetch ML fees:", err);
    } finally {
      setEditFeeLoading(false);
    }
  };

  const handleUpdatePrice = async () => {
    if (!listingId || !editPrice || parseFloat(editPrice) <= 0) return;
    setUpdatingPrice(true);
    await onUpdatePrice(listingId, parseFloat(editPrice));
    setUpdatingPrice(false);
    handleClose();
  };

  const handleClose = () => {
    setEditPrice("");
    setEditMlFee(null);
    setShowEditCalculator(true);
    onClose();
  };

  return (
    <Dialog open={!!listingId} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Alterar Preço do Anúncio
          </DialogTitle>
          <DialogDescription>Ajuste markup, impostos e veja o valor líquido real do Mercado Livre.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {listing && (
            <>
              {/* Current listing info */}
              <div className="p-3 rounded-lg bg-secondary/30 border border-border text-xs space-y-1.5">
                <p className="font-semibold text-foreground">{listing.title}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Preço atual ML:</span>
                  <span className="text-foreground font-medium">{formatCurrency(listing.price)}</span>
                  <span className="text-muted-foreground">Custo do produto:</span>
                  <span className="text-foreground font-medium">{formatCurrency(costPrice)}</span>
                  <span className="text-muted-foreground">Tipo de anúncio:</span>
                  <span className="text-foreground font-medium">
                    {listingTypeId === "gold_pro" ? "Premium" : listingTypeId === "gold_special" ? "Clássica" : listingTypeId}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Para trocar o tipo de anúncio, pause este e crie um novo.
                </p>
              </div>

              {/* Price Calculator */}
              {showEditCalculator && costPrice > 0 ? (
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <MlPriceCalculator
                    basePrice={costPrice}
                    onFinalPriceChange={(price) => setEditPrice(price.toFixed(2))}
                    compact
                    listingType={listingTypeId}
                    onFreeShippingChange={() => {}}
                    productDimensions={product?.dimensions as { length: number; width: number; height: number } | null}
                    productWeightKg={product?.weight_kg || null}
                    productCondition={product?.condition || "new"}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Novo Preço (R$)</label>
                  <input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {costPrice > 0 && (
                <button type="button" onClick={() => setShowEditCalculator(!showEditCalculator)} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  <Calculator className="w-3 h-3" />
                  {showEditCalculator ? "Digitar preço manualmente" : "Usar calculadora de preço"}
                </button>
              )}

              {/* Real ML Fees */}
              {newPrice > 0 && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Custos Reais do Mercado Livre</span>
                    <button type="button" onClick={() => fetchMlFees(newPrice, listing.category_id || "MLB1000", listingTypeId)} disabled={editFeeLoading} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                      {editFeeLoading ? <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" /> : <Calculator className="w-3 h-3" />}
                      {editFeeLoading ? "Consultando..." : "Consultar taxas ML"}
                    </button>
                  </div>
                  {editMlFee !== null ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between"><span className="text-muted-foreground">Preço de venda</span><span className="text-foreground">{formatCurrency(newPrice)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Taxas ML (comissão + fixa)</span><span className="text-destructive">-{formatCurrency(editMlFee)}</span></div>
                      <div className="flex justify-between font-semibold border-t border-border pt-1.5"><span className="text-foreground">Você receberá</span><span className="text-success">{formatCurrency(newPrice - editMlFee)}</span></div>
                      {costPrice > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Lucro líquido</span>
                          <span className={`font-semibold ${(newPrice - editMlFee - costPrice) >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(newPrice - editMlFee - costPrice)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Clique em "Consultar taxas ML" para ver o valor líquido real.</p>
                  )}
                </div>
              )}
            </>
          )}
          <button onClick={handleUpdatePrice} disabled={updatingPrice || !editPrice || parseFloat(editPrice) <= 0}
            className="w-full h-10 rounded-lg gradient-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {updatingPrice ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {updatingPrice ? "Atualizando..." : "Atualizar Preço"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
