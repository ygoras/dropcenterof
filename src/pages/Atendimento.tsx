import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { useTickets, useTicketMessages } from "@/hooks/useTickets";
import { useRole } from "@/hooks/useRole";
import { TicketList } from "@/components/atendimento/TicketList";
import { TicketChat } from "@/components/atendimento/TicketChat";
import { NewTicketDialog } from "@/components/atendimento/NewTicketDialog";

const Atendimento = () => {
  const { isAdmin } = useRole();
  const { tickets, loading, createTicket, updateTicketStatus } = useTickets();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const { messages, loading: msgLoading, sendMessage } = useTicketMessages(selectedTicketId);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            {isAdmin ? "Central de Atendimento" : "Suporte"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? "Gerencie tickets de suporte dos vendedores" : "Abra tickets e converse com a equipe de suporte"}
          </p>
        </div>
        <NewTicketDialog onSubmit={createTicket} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[400px]">
        {/* Ticket list */}
        <div className="bg-card rounded-xl border border-border overflow-y-auto p-2">
          <TicketList tickets={tickets} selectedId={selectedTicketId} onSelect={setSelectedTicketId} isAdmin={isAdmin} />
        </div>

        {/* Chat */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {selectedTicket ? (
            <TicketChat
              ticket={selectedTicket}
              messages={messages}
              loading={msgLoading}
              onSend={sendMessage}
              onUpdateStatus={updateTicketStatus}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Selecione um ticket para ver a conversa</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Atendimento;
