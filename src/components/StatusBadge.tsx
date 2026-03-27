import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  label?: string;
}

const statusConfig: Record<string, { bg: string; text: string; dot: string; defaultLabel: string }> = {
  active: { bg: "bg-success/10", text: "text-success", dot: "bg-success", defaultLabel: "Ativo" },
  under_review: { bg: "bg-info/10", text: "text-info", dot: "bg-info", defaultLabel: "Em revisão" },
  paused: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning", defaultLabel: "Pausado" },
  error: { bg: "bg-destructive/10", text: "text-destructive", dot: "bg-destructive", defaultLabel: "Erro" },
  pending: { bg: "bg-info/10", text: "text-info", dot: "bg-info", defaultLabel: "Pendente" },
  completed: { bg: "bg-success/10", text: "text-success", dot: "bg-success", defaultLabel: "Concluído" },
  confirmed: { bg: "bg-success/10", text: "text-success", dot: "bg-success", defaultLabel: "Confirmado" },
  approved: { bg: "bg-info/10", text: "text-info", dot: "bg-info", defaultLabel: "Aprovado" },
  picking: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning", defaultLabel: "Separando" },
  packing: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent", defaultLabel: "Embalando" },
  labeled: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary", defaultLabel: "Etiquetado" },
  packed: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent", defaultLabel: "Aguardando Retirada" },
  shipped: { bg: "bg-success/10", text: "text-success", dot: "bg-success", defaultLabel: "Expedido" },
  expired: { bg: "bg-destructive/10", text: "text-destructive", dot: "bg-destructive", defaultLabel: "Expirado" },
  overdue: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning", defaultLabel: "Atrasado" },
  blocked: { bg: "bg-destructive/10", text: "text-destructive", dot: "bg-destructive", defaultLabel: "Bloqueado" },
  cancelled: { bg: "bg-muted/50", text: "text-muted-foreground", dot: "bg-muted-foreground", defaultLabel: "Cancelado" },
  refunded: { bg: "bg-info/10", text: "text-info", dot: "bg-info", defaultLabel: "Reembolsado" },
  delivered: { bg: "bg-success/10", text: "text-success", dot: "bg-success", defaultLabel: "Entregue" },
  ready: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary", defaultLabel: "Pronto p/ Envio" },
  awaiting: { bg: "bg-info/10", text: "text-info", dot: "bg-info", defaultLabel: "Aguardando" },
  pending_credit: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning", defaultLabel: "Pendente Crédito" },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { bg: "bg-muted/50", text: "text-muted-foreground", dot: "bg-muted-foreground", defaultLabel: status };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.bg, config.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {label || config.defaultLabel}
    </span>
  );
}
