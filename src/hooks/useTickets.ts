import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/apiClient";
import { useSSE } from "@/hooks/useSSE";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export interface Ticket {
  id: string;
  tenant_id: string;
  created_by: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  tenant_name?: string;
  last_message?: string;
  unread_count?: number;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  is_admin: boolean;
  created_at: string;
  sender_name?: string;
}

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Ticket[]>("/api/tickets");
      setTickets(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // SSE realtime: auto-refresh when tickets change
  useSSE(["support_tickets"], () => {
    fetchTickets();
  });

  const createTicket = async (subject: string, category: string, priority: TicketPriority, firstMessage: string) => {
    try {
      const ticket = await api.post<Ticket>("/api/tickets", {
        subject,
        category,
        priority,
        message: firstMessage,
      });
      await fetchTickets();
      return ticket;
    } catch {
      return null;
    }
  };

  const updateTicketStatus = async (ticketId: string, status: TicketStatus) => {
    await api.patch(`/api/tickets/${ticketId}`, { status });
    await fetchTickets();
  };

  return { tickets, loading, fetchTickets, createTicket, updateTicketStatus };
}

export function useTicketMessages(ticketId: string | null) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const data = await api.get<TicketMessage[]>(`/api/tickets/${ticketId}/messages`);
      setMessages(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // SSE realtime: auto-refresh when new messages arrive
  useSSE(["support_messages"], () => {
    fetchMessages();
  });

  const sendMessage = async (message: string) => {
    if (!ticketId) return;
    await api.post(`/api/tickets/${ticketId}/messages`, { message });
    await fetchMessages();
  };

  return { messages, loading, fetchMessages, sendMessage };
}
