import { useState } from "react";
import { Download, Search, AlertTriangle, Link2, Package, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ProductWithStock } from "@/types/catalog";

interface ImportListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProducts: ProductWithStock[];
  onImport: (mlItemId: string, productId: string) => Promise<{ success?: boolean; error?: string; ml_error?: string; title?: string }>;
}

function extractMlItemId(input: string): string | null {
  const trimmed = input.trim();
  // Match any MLB prefix (MLB, MLBU, etc.) followed by digits
  // Works with: MLB1234567890, MLBU3668349828, MLB-1234567890-titulo...
  // URLs: https://www.mercadolivre.com.br/.../up/MLBU3668349828
  //       https://produto.mercadolivre.com.br/MLB-1234567890-...
  const match = trimmed.match(/MLB[A-Z]?\d+/i);
  if (match) return match[0].toUpperCase();
  return null;
}

export function ImportListingDialog({ open, onOpenChange, activeProducts, onImport }: ImportListingDialogProps) {
  const [mlUrl, setMlUrl] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mlItemId = extractMlItemId(mlUrl);

  const handleImport = async () => {
    if (!mlItemId || !selectedProduct) return;
    setImporting(true);
    setError("");
    setSuccess("");

    try {
      const result = await onImport(mlItemId, selectedProduct);
      if (result?.success) {
        setSuccess(`Anuncio "${result.title || mlItemId}" importado com sucesso!`);
        setTimeout(() => {
          onOpenChange(false);
          resetForm();
        }, 1500);
      } else {
        setError(result?.error || result?.ml_error || "Erro ao importar");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao importar anuncio");
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setMlUrl("");
    setSelectedProduct("");
    setError("");
    setSuccess("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Importar Anuncio do ML
          </DialogTitle>
          <DialogDescription>
            Cole o link ou ID do anuncio do Mercado Livre e vincule a um produto do catalogo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* ML URL/ID Input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Link ou ID do Anuncio ML <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={mlUrl}
                onChange={(e) => { setMlUrl(e.target.value); setError(""); }}
                placeholder="Cole o link do ML ou digite o ID (ex: MLB1234567890)"
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {mlUrl && !mlItemId && (
              <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> ID do anuncio nao encontrado. Use o formato MLB1234567890 ou cole o link completo.
              </p>
            )}
            {mlItemId && (
              <p className="text-[10px] text-green-500 mt-1 flex items-center gap-1">
                <Search className="w-3 h-3" /> ID detectado: {mlItemId}
              </p>
            )}
          </div>

          {/* Product Select */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Vincular ao Produto <span className="text-destructive">*</span>
            </label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto do catalogo..." />
              </SelectTrigger>
              <SelectContent>
                {activeProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{p.name}</span>
                      <span className="text-muted-foreground text-xs">({p.sku})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-500">
              {success}
            </div>
          )}

          {/* Import Button */}
          <button
            onClick={handleImport}
            disabled={!mlItemId || !selectedProduct || importing}
            className="w-full h-11 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Importar Anuncio
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
