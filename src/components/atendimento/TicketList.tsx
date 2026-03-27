import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Ticket, TicketStatus } from "@/hooks/useTickets";
import { MessageSquare } from "lucide-react";

const statusConfig: Record<TicketStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Aberto", variant: "destructive" },
  in_progress: { label: "Em andamento", variant: "default" },
  resolved: { label: "Resolvido", variant: "secondary" },
  closed: { label: "Fechado", variant: "outline" },
};

const priorityColors: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

interface TicketListProps {
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isAdmin: boolean;
}

export function TicketList({ tickets, selectedId, onSelect, isAdmin }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">Nenhum ticket encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tickets.map((ticket) => {
        const sc = statusConfig[ticket.status];
        return (
          <button
            key={ticket.id}
            onClick={() => onSelect(ticket.id)}
            className={cn(
              "w-full text-left p-3 rounded-lg border-l-4 transition-colors",
              priorityColors[ticket.priority] ?? "border-l-border",
              selectedId === ticket.id
                ? "bg-primary/10 border border-primary/20"
                : "bg-card hover:bg-muted/50 border border-transparent"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground line-clamp-1">{ticket.subject}</p>
              <Badge variant={sc.variant} className="text-[10px] shrink-0">{sc.label}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {isAdmin && <span>{ticket.tenant_name}</span>}
              <span>•</span>
              <span>{ticket.creator_name}</span>
              <span className="ml-auto">{format(new Date(ticket.updated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
