import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Timer, Package, HardHat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProductivityRow, OperatorProductivityRow } from "@/hooks/useAnalytics";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface Props {
  data: ProductivityRow[];
  operators?: OperatorProductivityRow[];
}

function formatTime(seconds: number) {
  if (seconds <= 0) return "—";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return min > 0 ? `${min}m${sec > 0 ? ` ${sec}s` : ""}` : `${sec}s`;
}

export function ProductivityTab({ data, operators = [] }: Props) {
  if (data.length === 0 && operators.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Timer className="w-10 h-10 mb-3 opacity-40" />
        <p className="font-medium">Sem dados de produtividade no período</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: format(parseISO(d.date), "dd/MM", { locale: ptBR }),
    embalados: d.packed_count,
    tempoMedio: Math.round(d.avg_time_seconds / 60 * 10) / 10,
  }));

  const totalPacked = data.reduce((s, d) => s + d.packed_count, 0);
  const avgTimeSec = data.reduce((s, d) => s + d.avg_time_seconds * d.packed_count, 0) / (totalPacked || 1);

  const operatorChartData = operators.map((o) => ({
    name: o.operator_name.length > 15 ? o.operator_name.slice(0, 15) + "…" : o.operator_name,
    embalados: o.packed_count,
    tempoMedio: Math.round(o.avg_time_seconds / 60 * 10) / 10,
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs text-muted-foreground font-medium">Total Embalados</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">{totalPacked}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs text-muted-foreground font-medium">Tempo Médio</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">{formatTime(Math.round(avgTimeSec))}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs text-muted-foreground font-medium">Dias Ativos</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">{data.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs text-muted-foreground font-medium">Operadores Ativos</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">{operators.length}</p>
        </div>
      </div>

      {/* Volume chart */}
      {data.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground text-sm">Volume Embalado por Dia</h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="embalados" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Embalados" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Time trend */}
      {data.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-4 h-4 text-chart-2" />
            <h3 className="font-display font-semibold text-foreground text-sm">Tempo Médio de Embalagem (min)</h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="min" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="tempoMedio" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="Tempo Médio" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Operator Productivity */}
      {operators.length > 0 && (
        <>
          <div className="bg-card rounded-xl border border-border p-5 shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <HardHat className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground text-sm">Produtividade por Operador</h3>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operatorChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Bar dataKey="embalados" radius={[0, 6, 6, 0]} name="Embalados">
                    {operatorChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Operador</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Embalados</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Tempo Médio</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Mais Rápido</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Mais Lento</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.map((op) => (
                    <tr key={op.operator_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-4 font-medium text-foreground flex items-center gap-2">
                        <HardHat className="w-4 h-4 text-muted-foreground" />
                        {op.operator_name}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-foreground">{op.packed_count}</td>
                      <td className="py-3 px-4 text-right text-foreground">{formatTime(op.avg_time_seconds)}</td>
                      <td className="py-3 px-4 text-right text-success">{formatTime(op.fastest_seconds)}</td>
                      <td className="py-3 px-4 text-right text-destructive">{formatTime(op.slowest_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
