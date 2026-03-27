import { Clock, Package, CheckCircle2, Timer } from "lucide-react";

interface Stats {
  queue: number;
  inProgress: number;
  completedToday: number;
  avgTime: number;
}

export function OperacaoStats({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Na Fila", value: stats.queue, icon: Clock, color: "text-info" },
    { label: "Em Andamento", value: stats.inProgress, icon: Package, color: "text-warning", valueColor: "text-warning" },
    { label: "Concluídos Hoje", value: stats.completedToday, icon: CheckCircle2, color: "text-success", valueColor: "text-success" },
    { label: "Tempo Médio", value: stats.avgTime > 0 ? `${stats.avgTime}min` : "—", icon: Timer, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className={`flex items-center gap-2 ${c.color} mb-1`}>
            <c.icon className="w-4 h-4" />
            <span className="text-[10px] font-medium">{c.label}</span>
          </div>
          <p className={`font-display text-xl font-bold ${c.valueColor || "text-foreground"}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
