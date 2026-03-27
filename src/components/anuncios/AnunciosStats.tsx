import { ShoppingCart } from "lucide-react";

interface AnunciosStatsProps {
  total: number;
  active: number;
  drafts: number;
  underReview: number;
  totalSales: number;
}

export function AnunciosStats({ total, active, drafts, underReview, totalSales }: AnunciosStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">Total</p>
        <p className="font-display text-xl font-bold text-foreground">{total}</p>
      </div>
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">Ativos</p>
        <p className="font-display text-xl font-bold text-success">{active}</p>
      </div>
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">Rascunhos</p>
        <p className="font-display text-xl font-bold text-foreground">{drafts}</p>
      </div>
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">Em Revisão</p>
        <p className="font-display text-xl font-bold text-info">{underReview}</p>
      </div>
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="flex items-center gap-1.5">
          <ShoppingCart className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">Vendas Total</p>
        </div>
        <p className="font-display text-xl font-bold text-primary">{totalSales}</p>
      </div>
    </div>
  );
}
