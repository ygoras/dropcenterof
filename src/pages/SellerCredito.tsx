import { useState } from "react";
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string) => {
  const d = new Date(date);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const SellerCredito = () => {
  const { balance, transactions, forecast, loading, generating, generatePix } = useWallet();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [pixResult, setPixResult] = useState<{ pix_code: string; pix_qr_image: string; amount: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount.replace(",", "."));
    if (!amount || amount < 1) {
      toast({ title: "Valor mínimo: R$ 1,00", variant: "destructive" });
      return;
    }
    try {
      const result = await generatePix(amount);
      if (result?.pix_code) {
        setPixResult({ pix_code: result.pix_code, pix_qr_image: result.pix_qr_image, amount });
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
              <TransactionRow key={tx.id} tx={tx} />
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
      <Dialog open={!!pixResult} onOpenChange={() => setPixResult(null)}>
        <DialogContent className="sm:max-w-sm">
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
              <p className="text-xs text-muted-foreground">
                O saldo será atualizado automaticamente após o pagamento ser confirmado.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isDeposit = tx.type === "deposit";
  const isRefund = tx.type === "refund";

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
        <StatusBadge status={statusMap[tx.status] ?? tx.status} />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</span>
      </div>
    </div>
  );
}

export default SellerCredito;
