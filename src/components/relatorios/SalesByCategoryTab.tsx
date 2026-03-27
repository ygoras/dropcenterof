import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Tag } from "lucide-react";
import type { SalesByCategoryRow } from "@/hooks/useAnalytics";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--accent))",
];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function SalesByCategoryTab({ data }: { data: SalesByCategoryRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Tag className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Sem dados de vendas por categoria no período</p>
      </div>
    );
  }

  const pieData = data.slice(0, 6).map((d) => ({
    name: d.category_name.length > 20 ? d.category_name.slice(0, 20) + "…" : d.category_name,
    value: d.revenue,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground text-sm">Receita por Categoria</h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  dataKey="value"
                  paddingAngle={3}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Categoria</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Qtd.</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Receita</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.category_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="py-3 px-4 text-foreground font-medium">{row.category_name}</td>
                  <td className="py-3 px-4 text-right text-foreground">{row.quantity_sold}</td>
                  <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
