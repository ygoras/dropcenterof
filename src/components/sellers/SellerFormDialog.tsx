import { useState, useEffect } from "react";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Plan } from "@/types/database";
import type { SellerWithDetails } from "@/hooks/useSellers";

interface SellerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seller: SellerWithDetails | null;
  plans: Plan[];
  onSubmitCreate: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    company_name: string;
    company_document?: string;
    plan_id: string;
    billing_day: number;
  }) => Promise<boolean>;
  onSubmitUpdate: (
    id: string,
    data: {
      name: string;
      phone?: string;
      tenant_id?: string;
      is_active: boolean;
      company_name?: string;
      company_document?: string;
      plan_id?: string;
      billing_day?: number;
    }
  ) => Promise<boolean>;
  onSendPasswordReset?: (email: string) => Promise<boolean>;
}

export function SellerFormDialog({
  open,
  onOpenChange,
  seller,
  plans,
  onSubmitCreate,
  onSubmitUpdate,
  onSendPasswordReset,
}: SellerFormDialogProps) {
  const isEdit = !!seller;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDocument, setCompanyDocument] = useState("");
  const [planId, setPlanId] = useState("");
  const [billingDay, setBillingDay] = useState("10");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);

  useEffect(() => {
    if (seller) {
      setName(seller.name);
      setEmail(seller.email);
      setPhone(seller.phone ?? "");
      setCompanyName(seller.tenant_name ?? "");
      setCompanyDocument("");
      setIsActive(seller.is_active);
      setPassword("");
      setPlanId(seller.plan_name ? plans.find(p => p.name === seller.plan_name)?.id ?? "" : "");
      setBillingDay(seller.billing_day?.toString() ?? "10");
    } else {
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setCompanyName("");
      setCompanyDocument("");
      setPlanId("");
      setBillingDay("10");
      setIsActive(true);
    }
  }, [seller, open, plans]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    let success: boolean;
    if (isEdit && seller) {
      success = await onSubmitUpdate(seller.id, {
        name,
        phone: phone || undefined,
        tenant_id: seller.tenant_id || undefined,
        is_active: isActive,
        company_name: companyName || undefined,
        company_document: companyDocument || undefined,
        plan_id: planId || undefined,
        billing_day: billingDay ? parseInt(billingDay) : undefined,
      });
    } else {
      if (!companyName || !planId) {
        setSubmitting(false);
        return;
      }
      success = await onSubmitCreate({
        email,
        password,
        name,
        phone: phone || undefined,
        company_name: companyName,
        company_document: companyDocument || undefined,
        plan_id: planId,
        billing_day: parseInt(billingDay),
      });
    }

    setSubmitting(false);
    if (success) onOpenChange(false);
  };

  const handlePasswordReset = async () => {
    if (!onSendPasswordReset || !seller?.email) return;
    setResettingPw(true);
    await onSendPasswordReset(seller.email);
    setResettingPw(false);
  };

  const selectedPlan = plans.find((p) => p.id === planId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEdit ? "Editar Vendedor" : "Novo Vendedor"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Dados do vendedor */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados do Vendedor</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          </div>

          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendedor@email.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha *</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />
              </div>
            </div>
          )}

          {isEdit && (
            <div className="space-y-2">
              <Label>E-mail</Label>
              <div className="flex gap-2">
                <Input value={email} disabled className="flex-1 opacity-60" />
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={resettingPw}
                  className="h-10 px-3 rounded-lg border border-input text-xs font-medium text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {resettingPw ? (
                    <div className="w-3 h-3 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5" />
                  )}
                  Redefinir Senha
                </button>
              </div>
            </div>
          )}

          {/* Dados da empresa */}
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Empresa do Vendedor</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nome da Empresa {!isEdit && "*"}</Label>
              <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Razão social" required={!isEdit} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyDoc">CNPJ</Label>
              <Input id="companyDoc" value={companyDocument} onChange={(e) => setCompanyDocument(e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
          </div>

          {/* Plano e billing */}
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plano e Cobrança</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan">Plano {!isEdit && "*"}</Label>
            <Select value={planId} onValueChange={setPlanId} required={!isEdit}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{p.name}</span>
                      <span className="text-muted-foreground text-xs">
                        R$ {p.price.toFixed(2).replace(".", ",")}/mês
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPlan && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-foreground">{selectedPlan.name}</span>
                <span className="text-sm font-bold text-primary">
                  R$ {selectedPlan.price.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{selectedPlan.description}</p>
              <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                {selectedPlan.max_products && <span>Até {selectedPlan.max_products} produtos</span>}
                {selectedPlan.max_listings && <span>• Até {selectedPlan.max_listings} anúncios</span>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="billingDay">Dia do vencimento mensal {!isEdit && "*"}</Label>
            <Select value={billingDay} onValueChange={setBillingDay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20, 25].map((d) => (
                  <SelectItem key={d} value={d.toString()}>
                    Dia {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Label htmlFor="active">Vendedor ativo</Label>
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : isEdit ? (
              "Salvar Alterações"
            ) : (
              "Criar Vendedor"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
