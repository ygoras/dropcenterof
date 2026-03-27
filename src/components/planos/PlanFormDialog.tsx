import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Plan } from "@/types/database";

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan | null;
  onSubmitCreate: (data: {
    name: string;
    slug: string;
    price: number;
    description?: string;
    max_listings?: number;
    max_stores?: number;
    features?: string[];
  }) => Promise<boolean>;
  onSubmitUpdate: (id: string, data: {
    name?: string;
    price?: number;
    description?: string;
    max_listings?: number | null;
    max_stores?: number;
    features?: string[];
    is_active?: boolean;
  }) => Promise<boolean>;
}

export function PlanFormDialog({ open, onOpenChange, plan, onSubmitCreate, onSubmitUpdate }: PlanFormDialogProps) {
  const isEdit = !!plan;
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [maxListings, setMaxListings] = useState("");
  const [maxStores, setMaxStores] = useState("1");
  const [featuresText, setFeaturesText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setPrice(plan.price.toString());
      setDescription(plan.description ?? "");
      setMaxListings(plan.max_listings?.toString() ?? "");
      setMaxStores((plan as any).max_stores?.toString() ?? "1");
      setFeaturesText(plan.features?.join("\n") ?? "");
      setIsActive(plan.is_active);
    } else {
      setName("");
      setPrice("");
      setDescription("");
      setMaxListings("");
      setMaxStores("1");
      setFeaturesText("");
      setIsActive(true);
    }
  }, [plan, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const features = featuresText.split("\n").map(f => f.trim()).filter(Boolean);
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let success: boolean;
    if (isEdit && plan) {
      success = await onSubmitUpdate(plan.id, {
        name,
        price: parseFloat(price),
        description: description || undefined,
        max_listings: maxListings ? parseInt(maxListings) : null,
        max_stores: maxStores ? parseInt(maxStores) : 1,
        features,
        is_active: isActive,
      });
    } else {
      success = await onSubmitCreate({
        name,
        slug,
        price: parseFloat(price),
        description: description || undefined,
        max_listings: maxListings ? parseInt(maxListings) : undefined,
        max_stores: maxStores ? parseInt(maxStores) : 1,
        features,
      });
    }

    setSubmitting(false);
    if (success) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEdit ? "Editar Plano" : "Novo Plano"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="planName">Nome do Plano *</Label>
            <Input id="planName" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bronze, Prata, Ouro" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="planPrice">Preço mensal (R$) *</Label>
              <Input id="planPrice" type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="99.90" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxListings">Máx. Anúncios Ativos</Label>
              <Input id="maxListings" type="number" min="1" value={maxListings} onChange={e => setMaxListings(e.target.value)} placeholder="Ilimitado" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="maxStores">Máx. Lojas ML</Label>
              <Input id="maxStores" type="number" min="1" value={maxStores} onChange={e => setMaxStores(e.target.value)} placeholder="1" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planDesc">Descrição</Label>
            <Input id="planDesc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição curta do plano" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="features">Benefícios / Tipo de Suporte (um por linha)</Label>
            <textarea
              id="features"
              value={featuresText}
              onChange={e => setFeaturesText(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Suporte por e-mail&#10;Suporte prioritário&#10;Gerente de conta dedicado"
            />
          </div>

          {isEdit && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Label htmlFor="planActive">Plano ativo</Label>
              <Switch id="planActive" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : isEdit ? "Salvar Alterações" : "Criar Plano"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
