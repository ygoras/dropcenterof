import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Package } from "lucide-react";
import type { SalesBySkuRow } from "@/hooks/useAnalytics";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function SalesBySkuTab({ data }: { data: SalesBySkuRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Sem dados de vendas por SKU no período</p>
      </div>
    );
  }

  // Show Logística column only if any row has logistics_cost > 0 (admin only)
  const hasLogistics = data.some((d) => (d.logistics_cost ?? 0) > 0);

  const chartData = data.slice(0, 10).map((d) => ({
    name: d.sku.length > 12 ? d.sku.slice(0, 12) + "…" : d.sku,
    revenue: d.revenue,
    net: d.net,
  }));

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground text-sm">Top 10 SKUs — Faturamento vs Líquido</h3>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Faturamento" />
              <Bar dataKey="net" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} name="Líquido" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">SKU</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Produto</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Qtd.</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Faturamento</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Custo</th>
                {hasLogistics && (
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Logística</th>
                )}
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Frete</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Taxas</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium text-success">Líquido</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const margin = row.revenue > 0 ? (row.net / row.revenue) * 100 : 0;
                return (
                  <tr key={row.sku} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-foreground">{row.sku}</td>
                    <td className="py-3 px-4 text-foreground">{row.product_name}</td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{row.quantity_sold}</td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(row.revenue)}</td>
                    <td className="py-3 px-4 text-right text-destructive">{formatCurrency(row.cost)}</td>
                    {hasLogistics && (
                      <td className="py-3 px-4 text-right text-orange-500">{formatCurrency(row.logistics_cost ?? 0)}</td>
                    )}
                    <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(row.shipping)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(row.fees)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-success">{formatCurrency(row.net)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={margin >= 0 ? "text-success" : "text-destructive"}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
