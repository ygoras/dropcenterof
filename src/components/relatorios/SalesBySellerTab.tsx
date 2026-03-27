import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { TrendingUp, Users, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SalesBySellerRow, DailyTrendRow } from "@/hooks/useAnalytics";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

interface Props {
  data: SalesBySellerRow[];
  dailyTrend: DailyTrendRow[];
}

export function SalesBySellerTab({ data, dailyTrend }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Users className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Sem dados de vendas no período</p>
      </div>
    );
  }

  const chartData = data.slice(0, 10).map((d) => ({
    name: d.tenant_name.length > 15 ? d.tenant_name.slice(0, 15) + "…" : d.tenant_name,
    revenue: d.total_revenue,
    net: d.total_net,
  }));

  const trendData = dailyTrend.map((d) => ({
    date: format(parseISO(d.date), "dd/MM", { locale: ptBR }),
    revenue: d.revenue,
    net: d.net,
    orders: d.orders,
  }));

  return (
    <div className="space-y-6">
      {/* Daily Trend Line Chart */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground text-sm">Evolução de Vendas por Dia</h3>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Faturamento" />
              <Line type="monotone" dataKey="net" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} name="Lucro Líquido" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar chart: Revenue vs Net by Seller */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground text-sm">Faturamento vs Líquido por Vendedor</h3>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} name="Faturamento" />
              <Bar dataKey="net" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} name="Líquido" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Financial Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Vendedor</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Pedidos</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Itens</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Faturamento</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Custo</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Frete</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Taxas ML</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium text-success">Líquido</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const margin = row.total_revenue > 0 ? (row.total_net / row.total_revenue) * 100 : 0;
                return (
                  <tr key={row.tenant_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4 font-medium text-foreground">{row.tenant_name}</td>
                    <td className="py-3 px-4 text-right text-foreground">{row.order_count}</td>
                    <td className="py-3 px-4 text-right text-foreground">{row.items_sold}</td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(row.total_revenue)}</td>
                    <td className="py-3 px-4 text-right text-destructive">{formatCurrency(row.total_cost)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(row.total_shipping)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(row.total_fees)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-success">{formatCurrency(row.total_net)}</td>
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
