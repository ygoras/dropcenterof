import { useState, useEffect } from "react";
import { Settings, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getPixConfig, savePixConfig } from "@/lib/pixConfig";

interface PixConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function PixConfigDialog({ open, onOpenChange, onSaved }: PixConfigDialogProps) {
  const [pixKey, setPixKey] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantCity, setMerchantCity] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      getPixConfig().then((config) => {
        setPixKey(config.pixKey);
        setMerchantName(config.merchantName);
        setMerchantCity(config.merchantCity);
      });
    }
  }, [open]);

  const handleSave = async () => {
    if (!pixKey.trim()) {
      toast({ title: "Chave PIX obrigatória", description: "Informe o CNPJ ou chave PIX.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const success = await savePixConfig({
      pixKey: pixKey.trim(),
      merchantName: merchantName.trim() || "DropCenter",
      merchantCity: merchantCity.trim() || "SAO PAULO",
    });
    setSaving(false);

    if (success) {
      toast({ title: "Chave PIX salva!", description: "Os próximos pagamentos usarão esta chave." });
      onSaved?.();
      onOpenChange(false);
    } else {
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar a configuração PIX.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Configurar Chave PIX
          </DialogTitle>
          <DialogDescription>
            Configure a chave PIX da plataforma para receber pagamentos dos vendedores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Chave PIX (CNPJ) *
            </label>
            <input
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Nome do Recebedor
            </label>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder="DropCenter"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Cidade
            </label>
            <input
              type="text"
              value={merchantCity}
              onChange={(e) => setMerchantCity(e.target.value)}
              placeholder="SAO PAULO"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          {!pixKey.trim() && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-xs text-warning font-medium">
                ⚠️ Chave PIX não configurada. Os códigos PIX gerados não serão válidos até configurar.
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-10 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Configuração"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
