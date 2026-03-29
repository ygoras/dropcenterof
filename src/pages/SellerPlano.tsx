import { useState, useEffect, useCallback } from "react";
import {
  CreditCard, Clock, CheckCircle2, AlertTriangle, XCircle,
  Copy, Check, QrCode, Crown, Calendar, RefreshCw,
  ArrowUpRight, ArrowDownRight, Sparkles,
} from "lucide-react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatDate = (d: string) => {
  const date = new Date(d);
  return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
};

interface SellerPayment {
  id: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  pix_code: string | null;
  pix_qr_url: string | null;
  payment_gateway_id: string | null;
  created_at: string;
}

interface SellerSubscription {
  id: string;
  plan_id: string;
  status: string;
  billing_day: number;
  current_period_start: string;
  current_period_end: string;
}

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  max_listings: number | null;
  features: string[];
  is_active: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  confirmed: { label: "Pago", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  expired: { label: "Vencido", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  refunded: { label: "Estornado", color: "bg-muted text-muted-foreground", icon: RefreshCw },
};

const subStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  active: { label: "Ativa", variant: "default" },
  overdue: { label: "Inadimplente", variant: "destructive" },
  blocked: { label: "Bloqueada", variant: "destructive" },
  cancelled: { label: "Cancelada", variant: "secondary" },
};

const SellerPlano = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [subscription, setSubscription] = useState<SellerSubscription | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [allPlans, setAllPlans] = useState<PlanInfo[]>([]);
  const [payments, setPayments] = useState<SellerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<SellerPayment | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Subscription PIX state
  const [generatingSubPix, setGeneratingSubPix] = useState(false);
  const [subPixResult, setSubPixResult] = useState<{ pix_code: string; pix_qr_image: string | null; amount: number; reference_id: string } | null>(null);
  const [subPixConfirmed, setSubPixConfirmed] = useState(false);

  // Plan change state
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [selectedNewPlan, setSelectedNewPlan] = useState<PlanInfo | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [lastRequestDate, setLastRequestDate] = useState<Date | null>(null);
  const [changeRestrictionChecked, setChangeRestrictionChecked] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.tenant_id) return;
    setLoading(true);

    // Fetch all plans
    const plansData = await api.get<PlanInfo[]>("/api/plans?is_active=true&order=price.asc");

    setAllPlans(plansData ?? []);

    const subRes = await api.get<any>(`/api/subscriptions?tenant_id=${profile.tenant_id}`);
    // API returns array, we need the first (most recent) subscription
    const subData = Array.isArray(subRes) ? subRes[0] ?? null : subRes ?? null;

    setSubscription(subData);

    if (subData?.plan_id) {
      const currentPlan = plansData?.find((p) => p.id === subData.plan_id) ?? null;
      setPlan(currentPlan);
    }

    const paymentsData = await api.get<SellerPayment[]>(`/api/payments?tenant_id=${profile.tenant_id}&limit=12&order=due_date.desc`);

    setPayments(paymentsData ?? []);
    setLoading(false);
  }, [profile?.tenant_id]);

  // Check if seller has a pending request or is within 90-day cooldown
  const checkChangeRestrictions = useCallback(async () => {
    if (!profile?.tenant_id) return;

    // Check for pending (unread) plan change requests from this tenant
    const pendingData = await api.get<any[]>(`/api/notifications?type=info&read=false&tenant_id=${profile.tenant_id}&limit=20&order=created_at.desc`);

    const pendingRequests = (pendingData ?? []).filter(
      (n: any) => n.metadata?.request_type === "plan_change" && !n.title?.includes("aprovada") && !n.title?.includes("recusada")
    );
    setHasPendingRequest(pendingRequests.length > 0);

    // Check for most recent plan change request (read or unread) for 90-day cooldown
    const allData = await api.get<any[]>(`/api/notifications?type=info&tenant_id=${profile.tenant_id}&limit=50&order=created_at.desc`);

    const allRequests = (allData ?? []).filter(
      (n: any) => n.metadata?.request_type === "plan_change" && !n.metadata?.request_type?.includes("response")
        && !(n as any).title?.includes("aprovada") && !(n as any).title?.includes("recusada")
    );

    if (allRequests.length > 0) {
      setLastRequestDate(new Date(allRequests[0].created_at));
    }

    setChangeRestrictionChecked(true);
  }, [profile?.tenant_id]);

  useEffect(() => { fetchData(); checkChangeRestrictions(); }, [fetchData, checkChangeRestrictions]);

  const handleCopyPix = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast({ title: "Código PIX copiado!" });
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const openPixDialog = (payment: SellerPayment) => {
    setSelectedPayment(payment);
    setPixDialogOpen(true);
    setCopiedCode(false);
  };

  const handleSelectNewPlan = (p: PlanInfo) => {
    setSelectedNewPlan(p);
    setChangeNote("");
    setChangePlanOpen(false);
    setConfirmOpen(true);
  };

  const handleSubmitPlanChange = async () => {
    if (!selectedNewPlan || !subscription || !profile?.tenant_id || !user) return;
    setSubmitting(true);

    try {
      const isUpgrade = selectedNewPlan.price > (plan?.price ?? 0);
      const changeType = isUpgrade ? "upgrade" : "downgrade";

      // Notify admin about the request via API
      await api.post("/api/notifications", {
        type: "info",
        title: `Solicitação de ${isUpgrade ? "upgrade" : "downgrade"} de plano`,
        message: `${profile.name} solicitou ${changeType} de ${plan?.name} para ${selectedNewPlan.name}. ${changeNote ? `Obs: ${changeNote}` : ""}`,
        action_url: "/planos",
        notify_admin: true,
        metadata: {
          request_type: "plan_change",
          current_plan_id: plan?.id,
          current_plan_name: plan?.name,
          requested_plan_id: selectedNewPlan.id,
          requested_plan_name: selectedNewPlan.name,
          change_type: changeType,
          tenant_id: profile.tenant_id,
          subscription_id: subscription.id,
          seller_name: profile.name,
          note: changeNote,
        },
      });

      toast({
        title: "Solicitação enviada!",
        description: `Seu pedido de ${changeType} para o plano ${selectedNewPlan.name} foi enviado ao administrador. Você será notificado quando for processado.`,
      });

      setConfirmOpen(false);
      setSelectedNewPlan(null);
      setChangeNote("");
    } catch (err: any) {
      toast({
        title: "Erro ao enviar solicitação",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const overduePayments = payments.filter((p) => p.status === "expired");
  const otherPlans = allPlans.filter((p) => p.id !== plan?.id);

  // 90-day cooldown check
  const COOLDOWN_DAYS = 90;
  const daysSinceLastRequest = lastRequestDate
    ? Math.floor((Date.now() - lastRequestDate.getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;
  const isInCooldown = daysSinceLastRequest < COOLDOWN_DAYS;
  const daysRemaining = COOLDOWN_DAYS - daysSinceLastRequest;
  const canRequestChange = changeRestrictionChecked && !hasPendingRequest && !isInCooldown;

  const handleGenerateSubscriptionPix = async () => {
    setGeneratingSubPix(true);
    try {
      const result = await api.post<any>("/api/payments/pix", { action: "generate_subscription_pix" });
      if (result?.pix_code) {
        setSubPixResult({
          pix_code: result.pix_code,
          pix_qr_image: result.pix_qr_image,
          amount: result.amount,
          reference_id: result.reference_id || result.payment_id,
        });
        // Start polling for payment confirmation
        const interval = setInterval(async () => {
          try {
            const subRes = await api.get<any>(`/api/subscriptions?tenant_id=${profile?.tenant_id}`);
            const sub = Array.isArray(subRes) ? subRes[0] : subRes;
            if (sub?.status === 'active') {
              clearInterval(interval);
              setSubPixConfirmed(true);
              fetchData();
              setTimeout(() => { setSubPixResult(null); setSubPixConfirmed(false); window.location.reload(); }, 3000);
            }
          } catch { /* ignore */ }
        }, 5000);
      } else {
        toast({ title: "Erro ao gerar PIX", description: result?.error || "Tente novamente", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao gerar cobrança", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingSubPix(false);
    }
  };

  const getChangeBlockReason = () => {
    if (hasPendingRequest) return "Você já possui uma solicitação de alteração em análise. Aguarde o processamento.";
    if (isInCooldown) return `Você só pode solicitar nova alteração após ${daysRemaining} dia(s). Última solicitação: ${lastRequestDate?.toLocaleDateString("pt-BR")}.`;
    return "";
  };

  return (
    <div className="space-y-6 p-6">
      {/* Banner de pagamento quando subscription não está ativa */}
      {subscription && subscription.status !== 'active' && !subPixResult && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg text-foreground">
                {subscription.status === 'pending' ? 'Ative sua assinatura' : 'Regularize sua assinatura'}
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                {plan ? `Plano ${plan.name} — ${formatCurrency(plan.price)}/mês` : 'Gere o PIX para ativar seu acesso'}
              </p>
            </div>
            <Button
              onClick={handleGenerateSubscriptionPix}
              disabled={generatingSubPix}
              className="gap-2"
            >
              {generatingSubPix ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4" />
              )}
              Gerar PIX
            </Button>
          </CardContent>
        </Card>
      )}

      {/* QR Code do PIX da assinatura */}
      {subPixResult && (
        <Card className="border-primary/50">
          <CardContent className="p-6 text-center space-y-4">
            {subPixConfirmed ? (
              <>
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <h3 className="font-semibold text-lg text-green-500">Pagamento Recebido!</h3>
                <p className="text-muted-foreground text-sm">Sua assinatura foi ativada.</p>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-lg">Pague via PIX para ativar</h3>
                <p className="text-2xl font-bold text-primary">{formatCurrency(subPixResult.amount)}</p>
                {subPixResult.pix_qr_image && (
                  <div className="flex justify-center">
                    <img
                      src={`data:image/png;base64,${subPixResult.pix_qr_image}`}
                      alt="QR Code PIX"
                      className="w-48 h-48 rounded-lg border border-border"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(subPixResult.pix_code);
                    toast({ title: "Codigo PIX copiado!" });
                  }}
                >
                  <Copy className="w-4 h-4" /> Copiar codigo PIX
                </Button>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Aguardando pagamento...
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meu Plano</h1>
          <p className="text-muted-foreground">Gerencie sua assinatura e pagamentos</p>
        </div>
        <div className="flex gap-2">
          {otherPlans.length > 0 && subscription && (
            <div className="relative group">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (!canRequestChange) {
                    toast({
                      title: "Alteração indisponível",
                      description: getChangeBlockReason(),
                      variant: "destructive",
                    });
                    return;
                  }
                  setChangePlanOpen(true);
                }}
                className={!canRequestChange ? "opacity-60" : ""}
              >
                <Sparkles className="h-4 w-4 mr-2" /> Alterar Plano
              </Button>
              {!canRequestChange && (
                <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-popover border border-border rounded-lg shadow-lg text-xs text-muted-foreground hidden group-hover:block z-50">
                  {getChangeBlockReason()}
                </div>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => { fetchData(); checkChangeRestrictions(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Plan change restriction alert */}
      {changeRestrictionChecked && !canRequestChange && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium text-sm text-foreground">
                {hasPendingRequest ? "Solicitação em análise" : "Período de carência"}
              </p>
              <p className="text-xs text-muted-foreground">
                {getChangeBlockReason()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan + Subscription Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Current Plan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              {plan?.name ?? "Sem plano"}
            </CardTitle>
            <CardDescription>
              {plan ? `${formatCurrency(plan.price)}/mês` : "Nenhuma assinatura ativa"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan?.features?.length ? (
              <ul className="text-sm space-y-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {plan?.max_listings && (
              <p className="text-sm text-muted-foreground">
                Até <strong>{plan.max_listings}</strong> anúncios ativos
              </p>
            )}
          </CardContent>
        </Card>

        {/* Subscription Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subscription ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={subStatusConfig[subscription.status]?.variant ?? "outline"}>
                    {subStatusConfig[subscription.status]?.label ?? subscription.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dia de cobrança</span>
                  <span className="text-sm font-medium">Dia {subscription.billing_day}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Período atual</span>
                  <span className="text-sm font-medium">
                    {formatDate(subscription.current_period_start)} — {formatDate(subscription.current_period_end)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {overduePayments.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">
                Você tem {overduePayments.length} cobrança(s) vencida(s)!
              </p>
              <p className="text-sm text-muted-foreground">
                Regularize para evitar o bloqueio da sua conta.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingPayments.length > 0 && overduePayments.length === 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10">
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <div>
              <p className="font-medium text-yellow-700 dark:text-yellow-400">
                Você tem {pendingPayments.length} cobrança(s) pendente(s)
              </p>
              <p className="text-sm text-muted-foreground">
                Pague via PIX para manter sua assinatura ativa.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Cobranças
          </CardTitle>
          <CardDescription>Histórico de pagamentos do seu plano</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma cobrança registrada.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => {
                const cfg = statusConfig[p.status] ?? statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${cfg.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{formatCurrency(p.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          Vencimento: {formatDate(p.due_date)}
                          {p.paid_at && ` • Pago: ${formatDate(p.paid_at)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cfg.color}>
                        {cfg.label}
                      </Badge>
                      {(p.status === "pending" || p.status === "expired") && p.pix_code && (
                        <Button size="sm" variant="outline" onClick={() => openPixDialog(p)}>
                          <QrCode className="h-4 w-4 mr-1" /> Pagar PIX
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PIX Payment Dialog */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Pagamento PIX
            </DialogTitle>
            <DialogDescription>
              {selectedPayment && `Cobrança de ${formatCurrency(selectedPayment.amount)} • Vencimento: ${formatDate(selectedPayment.due_date)}`}
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              {selectedPayment.pix_qr_url && (
                <div className="flex justify-center">
                  <img
                    src={selectedPayment.pix_qr_url}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-lg border"
                  />
                </div>
              )}
              {selectedPayment.pix_code && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Código PIX (Copia e Cola):</p>
                  <div className="flex gap-2">
                    <code className="flex-1 p-2 text-xs bg-muted rounded break-all max-h-20 overflow-y-auto">
                      {selectedPayment.pix_code}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyPix(selectedPayment.pix_code!)}
                    >
                      {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Após o pagamento, a confirmação é automática em poucos minutos.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Alterar Plano
            </DialogTitle>
            <DialogDescription>
              Plano atual: <strong>{plan?.name}</strong> ({formatCurrency(plan?.price ?? 0)}/mês).
              Selecione o novo plano desejado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {otherPlans.map((p) => {
              const isUpgrade = p.price > (plan?.price ?? 0);
              const diff = p.price - (plan?.price ?? 0);
              return (
                <Card
                  key={p.id}
                  className="cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-all"
                  onClick={() => handleSelectNewPlan(p)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isUpgrade ? "bg-green-100 dark:bg-green-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                          {isUpgrade ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(p.price)}/mês
                            {p.max_listings && ` • Até ${p.max_listings} anúncios`}
                          </p>
                        </div>
                      </div>
                      <Badge variant={isUpgrade ? "default" : "secondary"}>
                        {isUpgrade ? "Upgrade" : "Downgrade"}
                        {" "}({diff > 0 ? "+" : ""}{formatCurrency(diff)})
                      </Badge>
                    </div>
                    {p.features?.length > 0 && (
                      <ul className="mt-2 ml-12 text-xs text-muted-foreground space-y-0.5">
                        {p.features.slice(0, 3).map((f, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Plan Change Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar alteração de plano</DialogTitle>
            <DialogDescription>
              Sua solicitação será enviada ao administrador para aprovação.
            </DialogDescription>
          </DialogHeader>
          {selectedNewPlan && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Plano atual</span>
                  <span className="font-medium">{plan?.name} — {formatCurrency(plan?.price ?? 0)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Novo plano</span>
                  <span className="font-semibold text-primary">{selectedNewPlan.name} — {formatCurrency(selectedNewPlan.price)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Diferença</span>
                  <span className={`font-medium ${selectedNewPlan.price > (plan?.price ?? 0) ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                    {selectedNewPlan.price > (plan?.price ?? 0) ? "+" : ""}
                    {formatCurrency(selectedNewPlan.price - (plan?.price ?? 0))}/mês
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Observação (opcional)</label>
                <Textarea
                  placeholder="Ex: Preciso de mais anúncios para a Black Friday..."
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  rows={3}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                A alteração será aplicada pelo administrador. Você será notificado quando o novo plano estiver ativo.
                A diferença de valor será ajustada na próxima cobrança.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitPlanChange} disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellerPlano;
