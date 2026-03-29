import { useState, useEffect, useCallback } from "react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  MoreHorizontal,
  Ban,
  CircleDollarSign,
  Copy,
  QrCode,
  Zap,
  RefreshCw,
  Settings,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Crown,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Check,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import { usePayments } from "@/hooks/usePayments";
import { useManagePlans } from "@/hooks/useManagePlans";
import { PlanFormDialog } from "@/components/planos/PlanFormDialog";
import type { Plan } from "@/types/database";
import { api } from "@/lib/apiClient";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PixConfigDialog } from "@/components/financeiro/PixConfigDialog";
import { isPixConfigured as checkPixConfigured } from "@/lib/pixConfig";

const paymentStatusConfig: Record<string, { label: string; status: "active" | "pending" | "error" | "completed"; icon: React.ElementType }> = {
  pending: { label: "Pendente", status: "pending", icon: Clock },
  confirmed: { label: "Confirmado", status: "completed", icon: CheckCircle2 },
  expired: { label: "Vencido", status: "error", icon: XCircle },
  refunded: { label: "Estornado", status: "pending", icon: CircleDollarSign },
};

const Planos = () => {
  const { payments, loading: paymentsLoading, confirmPayment, blockSubscription, markOverdue, generatePlanCharge } = usePayments();
  const { plans, loading: plansLoading, createPlan, updatePlan, togglePlanActive } = useManagePlans();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDialog, setConfirmDialog] = useState<{ id: string; tenantId: string; sellerName: string; amount: number } | null>(null);
  const [blockDialog, setBlockDialog] = useState<{ tenantId: string; sellerName: string } | null>(null);
  const [pixDialog, setPixDialog] = useState<{ pixCode: string; sellerName: string; amount: number } | null>(null);
  const [pixConfigOpen, setPixConfigOpen] = useState(false);
  const [pixConfigured, setPixConfigured] = useState(true);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [generatingCharge, setGeneratingCharge] = useState<string | null>(null);
  const [chargeResult, setChargeResult] = useState<{ pix_code: string; pix_qr_image: string; amount: number; due_date: string } | null>(null);

  // Plan change requests state
  interface PlanChangeRequest {
    id: string;
    tenant_id: string;
    title: string;
    message: string;
    metadata: any;
    created_at: string;
    read: boolean;
  }
  const [planRequests, setPlanRequests] = useState<PlanChangeRequest[]>([]);
  const [processedRequests, setProcessedRequests] = useState<PlanChangeRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  const isPlanChangeRequest = (n: any) => {
    const meta = n.metadata;
    if (!meta?.request_type) return false;
    if (meta.request_type === "plan_change_response") return false;
    if (meta.request_type !== "plan_change") return false;
    if (n.title?.includes("aprovada") || n.title?.includes("recusada")) return false;
    return true;
  };

  const fetchPlanRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      // Fetch pending requests (unread)
      const pendingData = await api.get<any[]>("/api/notifications?type=info&read=false&limit=50");
      const pending = (pendingData ?? []).filter(isPlanChangeRequest);
      setPlanRequests(pending as PlanChangeRequest[]);

      // Fetch processed requests (read) for history
      const historyData = await api.get<any[]>("/api/notifications?type=info&read=true&limit=50");
      const history = (historyData ?? []).filter(isPlanChangeRequest);
      setProcessedRequests(history as PlanChangeRequest[]);
    } catch (err) {
      console.error("Error fetching plan requests:", err);
    }
    setRequestsLoading(false);
  }, []);

  const refreshPixStatus = useCallback(() => {
    checkPixConfigured().then(setPixConfigured);
  }, []);

  useEffect(() => {
    refreshPixStatus();
    fetchPlanRequests();
  }, [refreshPixStatus, fetchPlanRequests]);

  const handleApproveRequest = async (req: PlanChangeRequest) => {
    setProcessingRequest(req.id);
    try {
      const meta = req.metadata;
      // Update subscription to new plan
      await api.patch(`/api/subscriptions/${meta.subscription_id}`, {
        plan_id: meta.requested_plan_id,
        updated_at: new Date().toISOString(),
      });

      // Mark notification as read
      await api.patch(`/api/notifications/${req.id}`, { read: true });

      // Notify seller
      try {
        await api.post("/api/notifications", {
          tenant_id: req.tenant_id,
          type: "info",
          title: "Alteração de plano aprovada!",
          message: `Seu plano foi alterado de ${meta.current_plan_name} para ${meta.requested_plan_name}. A mudança já está ativa.`,
          action_url: "/seller/plano",
          metadata: { ...meta, request_type: "plan_change_response" },
        });
      } catch (e) { console.warn("Notification error:", e); }

      toast({ title: "Solicitação aprovada!", description: `Plano alterado para ${meta.requested_plan_name}.` });
      await fetchPlanRequests();
    } catch (err: any) {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = async (req: PlanChangeRequest) => {
    setProcessingRequest(req.id);
    try {
      const meta = req.metadata;
      // Mark notification as read
      await api.patch(`/api/notifications/${req.id}`, { read: true });

      // Notify seller
      try {
        await api.post("/api/notifications", {
          tenant_id: req.tenant_id,
          type: "info",
          title: "Solicitação de plano recusada",
          message: `Sua solicitação de alteração para o plano ${meta.requested_plan_name} foi recusada pelo administrador.`,
          action_url: "/seller/plano",
          metadata: { ...meta, request_type: "plan_change_response" },
        });
      } catch (e) { console.warn("Notification error:", e); }

      toast({ title: "Solicitação recusada" });
      await fetchPlanRequests();
    } catch (err: any) {
      toast({ title: "Erro ao recusar", description: err.message, variant: "destructive" });
    } finally {
      setProcessingRequest(null);
    }
  };

  const copyPixCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Código PIX copiado!", description: "Cole no app do seu banco para verificar." });
  };

  const filtered = payments.filter((p) => {
    const matchSearch =
      p.seller_name.toLowerCase().includes(search.toLowerCase()) ||
      p.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      p.seller_email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    pending: payments.filter((p) => p.status === "pending").length,
    pendingAmount: payments.filter((p) => p.status === "pending").reduce((acc, p) => acc + p.amount, 0),
    confirmed: payments.filter((p) => p.status === "confirmed").length,
    confirmedAmount: payments.filter((p) => p.status === "confirmed").reduce((acc, p) => acc + p.amount, 0),
    overdue: payments.filter((p) => p.status === "expired").length,
    blocked: new Set(payments.filter((p) => p.subscription_status === "blocked").map((p) => p.tenant_id)).size,
  };


  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Crown className="w-6 h-6 text-primary" />
            Planos & Assinaturas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie planos, cobranças e assinaturas dos vendedores
          </p>
        </div>
        {/* PIX configurado via Asaas — botão removido */}
      </div>

      <Tabs defaultValue="plans" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="subscriptions">Assinaturas & Pagamentos</TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            Solicitações
            {planRequests.filter(r => !r.read).length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {planRequests.filter(r => !r.read).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: PLANOS ===== */}
        <TabsContent value="plans" className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => { setEditingPlan(null); setPlanDialogOpen(true); }}
              className="h-10 px-4 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Novo Plano
            </button>
          </div>

          {plansLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
              <Crown className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhum plano cadastrado</p>
              <p className="text-sm mt-1">Crie o primeiro plano para seus vendedores</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <div key={plan.id} className={`bg-card rounded-xl border shadow-card p-6 flex flex-col ${plan.is_active ? 'border-border' : 'border-destructive/30 opacity-60'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-display font-bold text-lg text-foreground">{plan.name}</h3>
                      {!plan.is_active && (
                        <span className="text-[10px] font-semibold text-destructive uppercase">Inativo</span>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingPlan(plan); setPlanDialogOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => togglePlanActive(plan.id, plan.is_active)}>
                          {plan.is_active ? (
                            <><ToggleLeft className="w-4 h-4 mr-2" />Desativar</>
                          ) : (
                            <><ToggleRight className="w-4 h-4 mr-2" />Ativar</>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="text-2xl font-bold text-primary mb-1">
                    {formatCurrency(plan.price)}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                    <span>📢 {plan.max_listings ?? "∞"} anúncios ativos</span>
                    <span>🏪 {(plan as any).max_stores ?? 1} loja(s) ML</span>
                  </div>
                  {plan.features && plan.features.length > 0 && (
                    <ul className="space-y-1 mt-auto">
                      {plan.features.map((f, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== TAB: ASSINATURAS & PAGAMENTOS ===== */}
        <TabsContent value="subscriptions" className="space-y-6">
          {/* Generate charges for all active subscriptions */}
          <div className="flex justify-end">
            <button
              onClick={async () => {
                // Fetch all active subscriptions and generate charges
                try {
                  const subs = await api.get<{ id: string; tenant_id: string; status: string }[]>(
                    "/api/subscriptions?status=active,overdue"
                  );

                  if (!subs || subs.length === 0) {
                    toast({ title: "Nenhuma assinatura ativa encontrada", variant: "destructive" });
                    return;
                  }

                  let generated = 0;
                  let errors = 0;
                  for (const sub of subs) {
                    setGeneratingCharge(sub.tenant_id);
                    const result = await generatePlanCharge(sub.tenant_id, sub.id);
                    if (result?.success) {
                      generated++;
                    } else {
                      errors++;
                    }
                  }
                  setGeneratingCharge(null);
                  toast({
                    title: `${generated} cobrança(s) gerada(s)`,
                    description: errors > 0 ? `${errors} erro(s)` : "Todas geradas com sucesso via Asaas",
                  });
                } catch (err) {
                  setGeneratingCharge(null);
                  toast({ title: "Erro ao buscar assinaturas", variant: "destructive" });
                }
              }}
              disabled={!!generatingCharge}
              className="h-10 px-4 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {generatingCharge ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {generatingCharge ? "Gerando cobranças..." : "Gerar Cobranças Asaas (Todos)"}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center gap-2 text-warning mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Pendentes</span>
              </div>
              <p className="font-display text-xl font-bold text-foreground">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(stats.pendingAmount)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center gap-2 text-success mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Confirmados</span>
              </div>
              <p className="font-display text-xl font-bold text-foreground">{stats.confirmed}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(stats.confirmedAmount)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center gap-2 text-destructive mb-1">
                <XCircle className="w-4 h-4" />
                <span className="text-xs font-medium">Vencidos</span>
              </div>
              <p className="font-display text-xl font-bold text-foreground">{stats.overdue}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center gap-2 text-destructive mb-1">
                <Ban className="w-4 h-4" />
                <span className="text-xs font-medium">Bloqueados</span>
              </div>
              <p className="font-display text-xl font-bold text-foreground">{stats.blocked}</p>
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
                placeholder="Buscar por vendedor ou empresa..."
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="expired">Vencidos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payments Table */}
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CreditCard className="w-10 h-10 mb-3 opacity-40" />
                <p className="font-medium">Nenhum pagamento encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Vendedor</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Empresa</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Plano</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Valor</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Vencimento</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Pagamento</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Assinatura</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((payment) => {
                      const config = paymentStatusConfig[payment.status] ?? paymentStatusConfig.pending;
                      const isOverdue = payment.status === "pending" && new Date(payment.due_date) < new Date();
                      const subStatusMap: Record<string, "active" | "pending" | "error"> = {
                        active: "active",
                        overdue: "pending",
                        blocked: "error",
                        cancelled: "error",
                      };

                      return (
                        <tr key={payment.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-medium text-foreground block">{payment.seller_name}</span>
                              <span className="text-xs text-muted-foreground">{payment.seller_email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{payment.tenant_name}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                              {payment.plan_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-sm ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              {formatDate(payment.due_date)}
                            </span>
                            {isOverdue && (
                              <span className="block text-[10px] text-destructive font-medium">VENCIDO</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={config.status} label={config.label} />
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge
                              status={subStatusMap[payment.subscription_status] ?? "pending"}
                              label={payment.subscription_status === "active" ? "Ativa" :
                                     payment.subscription_status === "overdue" ? "Inadimplente" :
                                     payment.subscription_status === "blocked" ? "Bloqueado" : payment.subscription_status}
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {payment.pix_code && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => setPixDialog({
                                        pixCode: payment.pix_code!,
                                        sellerName: payment.seller_name,
                                        amount: payment.amount,
                                      })}
                                    >
                                      <QrCode className="w-4 h-4 mr-2 text-primary" />
                                      Ver Código PIX
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => copyPixCode(payment.pix_code!)}>
                                      <Copy className="w-4 h-4 mr-2" />
                                      Copiar PIX
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {payment.status === "pending" && (
                                  <DropdownMenuItem
                                    onClick={() => setConfirmDialog({
                                      id: payment.id,
                                      tenantId: payment.tenant_id,
                                      sellerName: payment.seller_name,
                                      amount: payment.amount,
                                    })}
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-2 text-success" />
                                    Confirmar Pagamento
                                  </DropdownMenuItem>
                                )}
                                {(payment.status === "pending" || payment.status === "expired") && (
                                  <DropdownMenuItem
                                    onClick={() => markOverdue(payment.id, payment.tenant_id)}
                                  >
                                    <AlertTriangle className="w-4 h-4 mr-2 text-warning" />
                                    Marcar como Vencido
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={!!generatingCharge}
                                  onClick={async () => {
                                    setGeneratingCharge(payment.tenant_id);
                                    const result = await generatePlanCharge(payment.tenant_id, payment.subscription_id);
                                    setGeneratingCharge(null);
                                    if (result?.success) {
                                      setChargeResult({
                                        pix_code: result.pix_code,
                                        pix_qr_image: result.pix_qr_image,
                                        amount: result.amount,
                                        due_date: result.due_date,
                                      });
                                    }
                                  }}
                                >
                                  <Zap className="w-4 h-4 mr-2 text-primary" />
                                  {generatingCharge === payment.tenant_id ? "Gerando..." : "Gerar Cobrança Asaas"}
                                </DropdownMenuItem>
                                {payment.subscription_status !== "blocked" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setBlockDialog({
                                        tenantId: payment.tenant_id,
                                        sellerName: payment.seller_name,
                                      })}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Ban className="w-4 h-4 mr-2" />
                                      Bloquear Vendedor
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ===== TAB: SOLICITAÇÕES ===== */}
        <TabsContent value="requests" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Solicitações de Alteração de Plano</h2>
              <p className="text-sm text-muted-foreground">Vendedores que solicitaram upgrade ou downgrade</p>
            </div>
            <button
              onClick={fetchPlanRequests}
              className="h-9 px-3 rounded-lg border border-input bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>

          {requestsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : planRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
              <Bell className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhuma solicitação</p>
              <p className="text-sm mt-1">Quando vendedores solicitarem mudança de plano, aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              {planRequests.map((req) => {
                const meta = req.metadata ?? {};
                const isUpgrade = meta.change_type === "upgrade";
                const isPending = !req.read;

                return (
                  <div
                    key={req.id}
                    className={`bg-card rounded-xl border p-4 shadow-card transition-colors ${isPending ? "border-primary/30 bg-primary/5" : "border-border opacity-70"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-full shrink-0 ${isUpgrade ? "bg-green-100 dark:bg-green-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                          {isUpgrade ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{meta.seller_name ?? "Vendedor"}</span>
                            <Badge variant={isUpgrade ? "default" : "secondary"} className="text-[10px]">
                              {isUpgrade ? "Upgrade" : "Downgrade"}
                            </Badge>
                            {isPending && (
                              <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">
                                Pendente
                              </Badge>
                            )}
                            {!isPending && (
                              <Badge variant="outline" className="text-[10px]">
                                Processada
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <span className="font-medium">{meta.current_plan_name ?? "—"}</span>
                            <span>→</span>
                            <span className="font-semibold text-primary">{meta.requested_plan_name ?? "—"}</span>
                          </div>
                          {meta.note && (
                            <p className="text-xs text-muted-foreground mt-1.5 italic">
                              "{meta.note}"
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {new Date(req.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>

                      {isPending && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleApproveRequest(req)}
                            disabled={!!processingRequest}
                            className="h-9 px-3 rounded-lg bg-green-600 text-white text-sm font-medium flex items-center gap-1.5 hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            Aprovar
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req)}
                            disabled={!!processingRequest}
                            className="h-9 px-3 rounded-lg border border-destructive text-destructive text-sm font-medium flex items-center gap-1.5 hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* History of processed requests */}
          {processedRequests.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Histórico de Solicitações Processadas
              </h3>
              <div className="space-y-2">
                {processedRequests.map((req) => {
                  const meta = req.metadata ?? {};
                  const isUpgrade = meta.change_type === "upgrade";

                  return (
                    <div
                      key={req.id}
                      className="bg-card rounded-lg border border-border p-3 opacity-70"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full shrink-0 ${isUpgrade ? "bg-green-100 dark:bg-green-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                          {isUpgrade ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-foreground">{meta.seller_name ?? "Vendedor"}</span>
                            <Badge variant={isUpgrade ? "default" : "secondary"} className="text-[10px]">
                              {isUpgrade ? "Upgrade" : "Downgrade"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              Processada
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{meta.current_plan_name}</span>
                            <span>→</span>
                            <span className="text-primary">{meta.requested_plan_name}</span>
                            <span className="ml-2">
                              {new Date(req.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Confirmar Pagamento PIX</DialogTitle>
            <DialogDescription>
              Confirmar recebimento de {confirmDialog && formatCurrency(confirmDialog.amount)} do vendedor <strong>{confirmDialog?.sellerName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setConfirmDialog(null)} className="flex-1 h-10 rounded-lg border border-input text-foreground text-sm font-medium hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button
              onClick={async () => {
                if (confirmDialog) {
                  await confirmPayment(confirmDialog.id, confirmDialog.tenantId);
                  setConfirmDialog(null);
                }
              }}
              className="flex-1 h-10 rounded-lg bg-success text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockDialog} onOpenChange={() => setBlockDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-destructive">Bloquear Vendedor</DialogTitle>
            <DialogDescription>
              Bloquear o vendedor <strong>{blockDialog?.sellerName}</strong>? O acesso à plataforma será removido e os anúncios no Mercado Livre serão pausados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setBlockDialog(null)} className="flex-1 h-10 rounded-lg border border-input text-foreground text-sm font-medium hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button
              onClick={async () => {
                if (blockDialog) {
                  await blockSubscription(blockDialog.tenantId);
                  setBlockDialog(null);
                }
              }}
              className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Bloquear
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pixDialog} onOpenChange={() => setPixDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Código PIX — Copia e Cola
            </DialogTitle>
            <DialogDescription>
              Pagamento de {pixDialog && formatCurrency(pixDialog.amount)} do vendedor <strong>{pixDialog?.sellerName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Código PIX (copia e cola):</p>
              <div className="bg-background rounded-md p-3 border border-input break-all text-xs font-mono text-foreground leading-relaxed">
                {pixDialog?.pixCode}
              </div>
            </div>
            <button
              onClick={() => { if (pixDialog) copyPixCode(pixDialog.pixCode); }}
              className="w-full h-10 mt-4 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Copy className="w-4 h-4" />
              Copiar Código PIX
            </button>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Envie este código ao vendedor para que ele realize o pagamento via PIX no app do banco.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <PlanFormDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        plan={editingPlan}
        onSubmitCreate={createPlan}
        onSubmitUpdate={updatePlan}
      />

      <PixConfigDialog open={pixConfigOpen} onOpenChange={setPixConfigOpen} onSaved={refreshPixStatus} />

      {/* Asaas Charge Result Dialog */}
      <Dialog open={!!chargeResult} onOpenChange={() => setChargeResult(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Cobrança Asaas Gerada
            </DialogTitle>
            <DialogDescription>
              Cobrança PIX criada com sucesso via Asaas.
            </DialogDescription>
          </DialogHeader>
          {chargeResult && (
            <div className="space-y-4 mt-2 text-center">
              <p className="text-2xl font-display font-bold text-foreground">
                {formatCurrency(chargeResult.amount)}
              </p>
              <p className="text-sm text-muted-foreground">
                Vencimento: {formatDate(chargeResult.due_date)}
              </p>
              {chargeResult.pix_qr_image && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${chargeResult.pix_qr_image}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-lg border border-border"
                  />
                </div>
              )}
              {chargeResult.pix_code && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(chargeResult.pix_code);
                    toast({ title: "Código PIX copiado!" });
                  }}
                  className="w-full h-10 rounded-lg border border-input text-foreground text-sm font-medium flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copiar Código PIX
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                O vendedor receberá uma notificação. O pagamento será confirmado automaticamente pelo webhook.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Planos;
