import { useState, useRef, useEffect } from "react";
import { Send, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Ticket, TicketStatus, TicketMessage } from "@/hooks/useTickets";

interface TicketChatProps {
  ticket: Ticket;
  messages: TicketMessage[];
  loading: boolean;
  onSend: (message: string) => Promise<void>;
  onUpdateStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  isAdmin: boolean;
}

export function TicketChat({ ticket, messages, loading, onSend, onUpdateStatus, isAdmin }: TicketChatProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    await onSend(text.trim());
    setText("");
    setSending(false);
  };

  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">{ticket.subject}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ticket.creator_name} • {ticket.category}
            </p>
          </div>
          {isAdmin && !isClosed && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => onUpdateStatus(ticket.id, "resolved")}>
                <CheckCircle className="w-3 h-3" /> Resolver
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => onUpdateStatus(ticket.id, "closed")}>
                <XCircle className="w-3 h-3" /> Fechar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.is_admin ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-xl px-4 py-2.5",
                  msg.is_admin
                    ? "bg-muted text-foreground rounded-bl-none"
                    : "bg-primary text-primary-foreground rounded-br-none"
                )}
              >
                <p className="text-xs font-medium mb-1 opacity-70">
                  {msg.sender_name} {msg.is_admin && <Badge variant="outline" className="text-[9px] ml-1 py-0">Admin</Badge>}
                </p>
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                <p className="text-[10px] opacity-50 mt-1 text-right">
                  {format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      {!isClosed ? (
        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={2}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button onClick={handleSend} disabled={sending || !text.trim()} size="icon" className="shrink-0 h-auto">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-border text-center text-sm text-muted-foreground">
          Este ticket foi {ticket.status === "resolved" ? "resolvido" : "fechado"}.
        </div>
      )}
    </div>
  );
}
