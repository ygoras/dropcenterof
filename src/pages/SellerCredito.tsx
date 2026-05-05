import { useState, useEffect, useRef } from "react";
import {
  Wallet,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  QrCode,
  ShieldCheck,
  RefreshCw,
  Banknote,
  Trash2,
  Eye,
} from "lucide-react";
import { useWallet, type WalletTransaction } from "@/hooks/useWallet";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency, formatDateTime as formatDate } from "@/lib/formatters";

const SellerCredito = () => {
  const { balance, specialCredit, transactions, forecast, loading, generating, generatePix, cancelCharge, reopenPix, checkChargeStatus, refetch } = useWallet();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [pixResult, setPixResult] = useState<{ pix_code: string; pix_qr_image: string; amount: number; reference_id?: string } | null>(null);
  const [pixConfirmed, setPixConfirmed] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for payment confirmation when PIX modal is open
  useEffect(() => {
    if (!pixResult?.reference_id) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    setPixConfirmed(false);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await checkChargeStatus(pixResult.reference_id!);
        if (res?.status === 'confirmed') {
          setPixConfirmed(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          refetch();
          setTimeout(() => { setPixResult(null); setPixConfirmed(false); }, 4000);
        }
      } catch { /* ignore */ }
    }, 5000);

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [pixResult?.reference_id]);

  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount.replace(",", "."));
    if (!amount || amount < 1) {
      toast({ title: "Valor mínimo: R$ 1,00", variant: "destructive" });
      return;
    }
    try {
      const result = await generatePix(amount);
      if (result?.pix_code) {
        setPixResult({ pix_code: result.pix_code, pix_qr_image: result.pix_qr_image, amount, reference_id: result.reference_id });
        setRechargeOpen(false);
        setRechargeAmount("");
      } else {
        toast({ title: "Erro ao gerar PIX", description: result?.error || "Tente novamente", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao gerar cobrança PIX", variant: "destructive" });
    }
  };

  const copyPixCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast({ title: "Código PIX copiado!" });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const pendingDeposits = transactions.filter((t) => t.type === "deposit" && t.status === "pending").length;
  const totalDeposited = transactions.filter((t) => t.type === "deposit" && t.status === "confirmed").reduce((s, t) => s + t.amount, 0);
  const totalDebited = transactions.filter((t) => t.type === "debit" && t.status === "confirmed").reduce((s, t) => s + t.amount, 0);

  const daysLeft = forecast?.days_until_empty;
  const isLowBalance = daysLeft !== null && daysLeft !== undefined && daysLeft <= 7;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />
          Crédito & Carteira
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie seu saldo, recarregue via PIX e acompanhe seus gastos
        </p>
      </div>

      {/* Low Balance Alert */}
      {isLowBalance && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-warning">Saldo baixo!</p>
            <p className="text-xs text-warning/80">
              Com base no seu gasto médio, seu saldo dura aproximadamente{" "}
              <strong>{daysLeft} {daysLeft === 1 ? "dia" : "dias"}</strong>.
              Recarregue para evitar bloqueio de pedidos.
            </p>
          </div>
          <Button size="sm" className="ml-auto gap-1.5 shrink-0" onClick={() => setRechargeOpen(true)}>
            <QrCode className="w-3.5 h-3.5" /> Recarregar
          </Button>
        </div>
      )}

      {/* Balance Card - Hero */}
      <div className="gradient-primary rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 opacity-80" />
            <span className="text-xs font-medium opacity-80">Saldo disponível</span>
          </div>
          <p className="text-4xl font-display font-bold tracking-tight">{formatCurrency(balance)}</p>
          {specialCredit > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-full text-xs font-medium" title="Crédito especial concedido pelo admin. Sua carteira é debitada primeiro; este crédito só é usado quando o saldo da carteira ficar insuficiente.">
              <Banknote className="w-3.5 h-3.5" />
              Crédito Especial: {formatCurrency(specialCredit)}
            </div>
          )}
          <div className="flex items-center gap-4 mt-4">
            <Button
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0 gap-1.5"
              onClick={() => setRechargeOpen(true)}
            >
              <QrCode className="w-4 h-4" /> Recarregar via PIX
            </Button>
            {pendingDeposits > 0 && (
              <span className="text-xs bg-white/15 px-2.5 py-1 rounded-full">
                {pendingDeposits} recarga(s) pendente(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {specialCredit > 0 && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-start gap-3">
          <Banknote className="w-5 h-5 text-info shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Você tem crédito especial de {formatCurrency(specialCredit)}</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Concedido pelo admin. Suas vendas debitam primeiro do saldo da carteira; o crédito especial é usado apenas se o saldo da carteira ficar insuficiente.
            </p>
          </div>
        </div>
      )}

      {/* Pending Credit Orders Alert */}
      {forecast && forecast.pending_credit_orders > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">
                {forecast.pending_credit_orders} pedido(s) aguardando credito
              </p>
              <p className="text-xs text-muted-foreground">
                Deposite para liberar os pedidos bloqueados por saldo insuficiente.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 border-warning text-warning hover:bg-warning/10"
            onClick={() => setRechargeOpen(true)}
          >
            <QrCode className="w-3.5 h-3.5" /> Recarregar
          </Button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-success mb-1">
            <ArrowDownLeft className="w-4 h-4" />
            <span className="text-xs font-medium text-muted-foreground">Total Depositado</span>
          </div>
          <p className="text-xl font-display font-bold text-card-foreground">{formatCurrency(totalDeposited)}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <ArrowUpRight className="w-4 h-4" />
            <span className="text-xs font-medium text-muted-foreground">Total Gasto</span>
          </div>
          <p className="text-xl font-display font-bold text-card-foreground">{formatCurrency(totalDebited)}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-warning mb-1">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs font-medium text-muted-foreground">Projeção Semanal</span>
          </div>
          <p className="text-xl font-display font-bold text-card-foreground">
            {forecast ? formatCurrency(forecast.weekly_forecast) : "—"}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1" style={{ color: isLowBalance ? "hsl(var(--destructive))" : "hsl(var(--success))" }}>
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium text-muted-foreground">Dias de Operação</span>
          </div>
          <p className="text-xl font-display font-bold text-card-foreground">
            {daysLeft !== null && daysLeft !== undefined ? `${daysLeft} dias` : "∞"}
          </p>
          {forecast && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ~{forecast.avg_orders_per_day} pedidos/dia • {formatCurrency(forecast.avg_daily_cost)}/dia
            </p>
          )}
        </div>
      </div>

      {/* Spending Forecast Detail */}
      {forecast && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <Banknote className="w-4 h-4 text-primary" />
            Projeção de Gastos
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Pedidos (30d)</p>
              <p className="font-semibold text-foreground">{forecast.total_orders_30d}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Custo Total (30d)</p>
              <p className="font-semibold text-foreground">{formatCurrency(forecast.total_cost_30d)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Gasto Mensal Projetado</p>
              <p className="font-semibold text-foreground">{formatCurrency(forecast.monthly_forecast)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Média por Pedido</p>
              <p className="font-semibold text-foreground">
                {forecast.total_orders_30d > 0
                  ? formatCurrency(forecast.total_cost_30d / forecast.total_orders_30d)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-card rounded-xl border border-border">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold text-foreground">Histórico de Transações</h3>
          <span className="text-xs text-muted-foreground">{transactions.length} registros</span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma transação encontrada.
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                onCancel={cancelCharge}
                onReopen={async (refId) => {
                  try {
                    const result = await reopenPix(refId);
                    if (result?.pix_code) {
                      setPixResult({ pix_code: result.pix_code, pix_qr_image: result.pix_qr_image, amount: result.amount, reference_id: refId });
                    } else {
                      toast({ title: "QR Code indisponível", description: "A cobrança pode ter expirado.", variant: "destructive" });
                    }
                  } catch {
                    toast({ title: "Erro ao reabrir QR Code", variant: "destructive" });
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recharge Dialog */}
      <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Recarregar Carteira</DialogTitle>
            <DialogDescription>Informe o valor para gerar uma cobrança PIX.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">Valor (R$)</label>
              <Input
                type="text"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                placeholder="Ex: 500,00"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              {[100, 250, 500, 1000].map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setRechargeAmount(v.toString())}
                >
                  R$ {v}
                </Button>
              ))}
            </div>
            <Button className="w-full gap-2" onClick={handleRecharge} disabled={generating}>
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              {generating ? "Gerando..." : "Gerar PIX"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIX Result Dialog */}
      <Dialog open={!!pixResult} onOpenChange={() => { setPixResult(null); setPixConfirmed(false); }}>
        <DialogContent className="sm:max-w-sm">
          {pixConfirmed ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Pagamento Recebido!</DialogTitle>
                <DialogDescription>Seu saldo foi atualizado com sucesso.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2 text-center">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <p className="text-2xl font-display font-bold text-green-500">
                  +{pixResult && formatCurrency(pixResult.amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Crédito adicionado à sua carteira.
                </p>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">PIX Gerado</DialogTitle>
                <DialogDescription>Escaneie o QR Code ou copie o código PIX.</DialogDescription>
              </DialogHeader>
              {pixResult && (
                <div className="space-y-4 mt-2 text-center">
                  <p className="text-2xl font-display font-bold text-foreground">
                    {formatCurrency(pixResult.amount)}
                  </p>
                  {pixResult.pix_qr_image && (
                    <div className="flex justify-center">
                      <img
                        src={`data:image/png;base64,${pixResult.pix_qr_image}`}
                        alt="QR Code PIX"
                        className="w-48 h-48 rounded-lg border border-border"
                      />
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => copyPixCode(pixResult.pix_code)}
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedCode ? "Copiado!" : "Copiar código PIX"}
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Aguardando pagamento...
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function TransactionRow({ tx, onCancel, onReopen }: {
  tx: WalletTransaction;
  onCancel: (refId: string) => Promise<any>;
  onReopen: (refId: string) => Promise<void>;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reopening, setReopening] = useState(false);
  const isDeposit = tx.type === "deposit";
  const isRefund = tx.type === "refund";
  const isPendingDeposit = isDeposit && tx.status === "pending" && tx.reference_id;

  const icon = isDeposit ? (
    <ArrowDownLeft className="w-4 h-4 text-success" />
  ) : isRefund ? (
    <RefreshCw className="w-4 h-4 text-info" />
  ) : (
    <ArrowUpRight className="w-4 h-4 text-destructive" />
  );

  const statusMap: Record<string, string> = {
    pending: "pending",
    confirmed: "confirmed",
    failed: "error",
    cancelled: "cancelled",
  };

  return (
    <div className="p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {isDeposit ? "+" : "-"}{formatCurrency(tx.amount)}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {tx.description || (isDeposit ? "Recarga" : "Débito pedido")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isPendingDeposit && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              disabled={reopening}
              onClick={async () => {
                setReopening(true);
                try { await onReopen(tx.reference_id!); } finally { setReopening(false); }
              }}
            >
              {reopening ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              QR Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                try { await onCancel(tx.reference_id!); } finally { setCancelling(false); }
              }}
            >
              {cancelling ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Cancelar
            </Button>
          </>
        )}
        <StatusBadge status={statusMap[tx.status] ?? tx.status} />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</span>
      </div>
    </div>
  );
}

export default SellerCredito;
