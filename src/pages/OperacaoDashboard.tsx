import { useState, useEffect, useCallback } from "react";
import { Package, RefreshCw, Clock, BoxesIcon, Truck, CheckCircle2, Timer, TrendingUp } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";
import { Link } from "react-router-dom";

interface DashboardStats {
  queue: number;
  packing: number;
  awaitingPickup: number;
  completedToday: number;
  avgTimeMin: number;
}

const OperacaoDashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({ queue: 0, packing: 0, awaitingPickup: 0, completedToday: 0, avgTimeMin: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const [orders, tasks] = await Promise.all([
      api.get<any[]>("/api/orders?status=approved,confirmed,picking,packing,packed,labeled,shipped&fields=id,status"),
      api.get<any[]>("/api/picking-tasks?fields=started_at,completed_at,status"),
    ]).then(res => res.map(r => r ?? []));

    const queue = orders.filter((o: any) => o.status === "approved" || o.status === "confirmed").length;
    const packing = orders.filter((o: any) => ["picking", "packing"].includes(o.status)).length;
    const awaitingPickup = orders.filter((o: any) => o.status === "packed" || o.status === "labeled").length;

    const today = new Date().toISOString().split("T")[0];
    const completedToday = tasks.filter((t: any) => t.completed_at && t.completed_at.startsWith(today)).length;
    const done = tasks.filter((t: any) => t.completed_at && t.started_at);
    const avgMs = done.length
      ? done.reduce((s: number, t: any) => s + (new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()), 0) / done.length
      : 0;

    setStats({ queue, packing, awaitingPickup, completedToday, avgTimeMin: Math.round(avgMs / 60000) });
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useSSE(["orders", "picking_tasks"], () => fetchStats());

  const cards = [
    { label: "Aguardando Separação", value: stats.queue, icon: Clock, color: "text-info", bg: "bg-info/10", link: "/operacao/separacao" },
    { label: "Em Embalagem", value: stats.packing, icon: BoxesIcon, color: "text-warning", bg: "bg-warning/10", link: "/operacao/embalagem" },
    { label: "Aguardando Retirada", value: stats.awaitingPickup, icon: Truck, color: "text-primary", bg: "bg-primary/10", link: "/operacao/embalagem" },
    { label: "Concluídos Hoje", value: stats.completedToday, icon: CheckCircle2, color: "text-success", bg: "bg-success/10", link: null },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1200px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Portal de Operação
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral da operação do galpão</p>
        </div>
        <button onClick={fetchStats} className="h-10 px-5 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors self-start">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => {
          const Content = (
            <div key={c.label} className="glass-card rounded-2xl p-4 sm:p-5 hover:shadow-elevated transition-shadow">
              <div className={`flex items-center gap-2 ${c.color} mb-2`}>
                <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <c.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium">{c.label}</span>
              </div>
              <p className={`font-display text-2xl sm:text-3xl font-bold ${c.color}`}>{loading ? "—" : c.value}</p>
            </div>
          );
          return c.link ? (
            <Link key={c.label} to={c.link} className="block">{Content}</Link>
          ) : (
            <div key={c.label}>{Content}</div>
          );
        })}
      </div>

      {/* Avg time card */}
      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Timer className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tempo Médio (separação → aguardando retirada)</p>
            <p className="font-display text-2xl font-bold text-foreground">
              {loading ? "—" : stats.avgTimeMin > 0 ? `${stats.avgTimeMin} min` : "Sem dados"}
            </p>
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/operacao/separacao" className="glass-card rounded-2xl p-5 sm:p-6 hover:shadow-elevated transition-all hover:border-primary/30 group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center group-hover:bg-info/20 transition-colors">
              <Clock className="w-6 h-6 text-info" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Separação de Produtos</p>
              <p className="text-sm text-muted-foreground hidden sm:block">Selecione SKUs, imprima etiquetas e inicie a separação</p>
            </div>
            <TrendingUp className="w-5 h-5 text-muted-foreground ml-auto hidden sm:block" />
          </div>
        </Link>
        <Link to="/operacao/embalagem" className="glass-card rounded-2xl p-5 sm:p-6 hover:shadow-elevated transition-all hover:border-primary/30 group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center group-hover:bg-warning/20 transition-colors">
              <BoxesIcon className="w-6 h-6 text-warning" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Bancada de Embalagem</p>
              <p className="text-sm text-muted-foreground hidden sm:block">Bipe etiquetas, embale e finalize pedidos</p>
            </div>
            <TrendingUp className="w-5 h-5 text-muted-foreground ml-auto hidden sm:block" />
          </div>
        </Link>
      </div>
    </div>
  );
};

export default OperacaoDashboard;
