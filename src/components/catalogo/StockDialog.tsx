import { useState, useEffect } from "react";
import { Boxes, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ProductWithStock } from "@/types/catalog";

interface StockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithStock | null;
  onSubmit: (productId: string, data: { quantity?: number; min_stock?: number; location?: string }) => Promise<boolean>;
}

export function StockDialog({ open, onOpenChange, product, onSubmit }: StockDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [minStock, setMinStock] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && product) {
      setQuantity(String(product.stock_quantity));
      setMinStock(String(product.stock_min));
      setLocation("");
    }
  }, [open, product]);

  const handleSubmit = async () => {
    if (!product) return;
    setSubmitting(true);
    const ok = await onSubmit(product.id, {
      quantity: parseInt(quantity) || 0,
      min_stock: parseInt(minStock) || 5,
      location: location.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary" />
            Estoque — {product?.name}
          </DialogTitle>
          <DialogDescription>Atualize o estoque deste produto.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Quantidade</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Mínimo</label>
              <input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Localização</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Prateleira A3" className={inputClass} />
          </div>

          {product && product.low_stock && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-xs text-warning font-medium">⚠️ Estoque baixo! Disponível: {product.stock_available}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => onOpenChange(false)} className="flex-1 h-10 rounded-lg border border-input text-foreground text-sm font-medium hover:bg-secondary transition-colors">Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-10 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Salvar</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
