import { useState } from "react";
import {
  Wallet,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useAdminWallet, SellerWalletInfo } from "@/hooks/useAdminWallet";

const Financeiro = () => {
  const { sellers, summary, loading } = useAdminWallet();
  const [search, setSearch] = useState("");

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const filtered = sellers.filter(
    (s) =>
      s.seller_name.toLowerCase().includes(search.toLowerCase()) ||
      s.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      s.seller_email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />
          Financeiro — Créditos & Carteiras
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visão geral dos saldos e movimentações financeiras dos vendedores
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <DollarSign className="w-5 h-5" />
                  <span className="text-xs font-medium uppercase tracking-wider">Saldo Total Plataforma</span>
                </div>
                <p className="font-display text-2xl font-bold text-foreground">
                  {formatCurrency(summary.total_balance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Distribuído entre {summary.total_sellers} vendedor{summary.total_sellers !== 1 ? "es" : ""}
                </p>
              </div>

              <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                <div className="flex items-center gap-2 text-success mb-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-xs font-medium uppercase tracking-wider">Total Depositado</span>
                </div>
                <p className="font-display text-2xl font-bold text-foreground">
                  {formatCurrency(summary.total_deposits_all)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3 text-success" />
                  Todas as recargas confirmadas
                </p>
              </div>

              <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <TrendingDown className="w-5 h-5" />
                  <span className="text-xs font-medium uppercase tracking-wider">Total Debitado</span>
                </div>
                <p className="font-display text-2xl font-bold text-foreground">
                  {formatCurrency(summary.total_debits_all)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <ArrowDownRight className="w-3 h-3 text-destructive" />
                  Custos de produtos vendidos
                </p>
              </div>

              <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Users className="w-5 h-5" />
                  <span className="text-xs font-medium uppercase tracking-wider">Média por Vendedor</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Saldo médio</span>
                    <span className="font-display text-sm font-bold text-foreground">
                      {formatCurrency(summary.avg_balance_per_seller)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Gasto médio</span>
                    <span className="font-display text-sm font-bold text-foreground">
                      {formatCurrency(summary.avg_spend_per_seller)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alert cards */}
          {summary && (summary.sellers_with_zero > 0 || summary.sellers_with_low > 0) && (
            <div className="flex gap-4 flex-wrap">
              {summary.sellers_with_zero > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {summary.sellers_with_zero} vendedor{summary.sellers_with_zero !== 1 ? "es" : ""} com saldo zerado
                </div>
              )}
              {summary.sellers_with_low > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {summary.sellers_with_low} vendedor{summary.sellers_with_low !== 1 ? "es" : ""} com saldo baixo (&lt; R$ 100)
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por vendedor ou empresa..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
            />
          </div>

          {/* Sellers wallet table */}
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Wallet className="w-10 h-10 mb-3 opacity-40" />
                <p className="font-medium">Nenhum vendedor encontrado</p>
                <p className="text-sm mt-1">
                  {search ? "Tente outra busca" : "Nenhum vendedor possui carteira ativa"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Vendedor</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Empresa</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">Saldo Atual</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">Total Depositado</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">Total Gasto</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Última Movimentação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((seller) => (
                      <tr key={seller.tenant_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                              {seller.seller_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-foreground block">{seller.seller_name}</span>
                              <span className="text-xs text-muted-foreground">{seller.seller_email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{seller.tenant_name}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-semibold ${seller.balance <= 0 ? 'text-destructive' : seller.balance < 100 ? 'text-warning' : 'text-success'}`}>
                            {formatCurrency(seller.balance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          <span className="flex items-center justify-end gap-1">
                            <ArrowUpRight className="w-3 h-3 text-success" />
                            {formatCurrency(seller.total_deposits)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          <span className="flex items-center justify-end gap-1">
                            <ArrowDownRight className="w-3 h-3 text-destructive" />
                            {formatCurrency(seller.total_debits)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {seller.last_transaction_at
                            ? new Date(seller.last_transaction_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Financeiro;
