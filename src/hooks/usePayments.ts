import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/apiClient";
import type { Payment, PaymentStatus } from "@/types/database";
import { toast } from "@/hooks/use-toast";

export interface PaymentWithDetails extends Payment {
  tenant_name: string;
  seller_name: string;
  seller_email: string;
  plan_name: string;
  subscription_status: string;
}

export function usePayments() {
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = useCallback(async () => {
    setLoading(true);

    try {
      const data = await api.get<PaymentWithDetails[]>("/api/payments");
      setPayments(data);
    } catch (err: any) {
      toast({ title: "Erro ao carregar pagamentos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const confirmPayment = async (paymentId: string, tenantId: string) => {
    try {
      await api.patch(`/api/payments/${paymentId}`, {
        status: "confirmed" as PaymentStatus,
        paid_at: new Date().toISOString(),
      });

      // Reactivate subscription
      await api.patch(`/api/subscriptions/${tenantId}`, { status: "active", blocked_at: null });

      toast({ title: "Pagamento confirmado!", description: "Assinatura reativada com sucesso." });
      await fetchPayments();
    } catch (err: any) {
      toast({ title: "Erro ao confirmar", description: err.message, variant: "destructive" });
    }
  };

  const blockSubscription = async (tenantId: string) => {
    try {
      await api.patch(`/api/subscriptions/${tenantId}`, {
        status: "blocked",
        blocked_at: new Date().toISOString(),
      });

      toast({ title: "Vendedor bloqueado", description: "Acesso e anúncios serão pausados." });
      await fetchPayments();
    } catch (err: any) {
      toast({ title: "Erro ao bloquear", description: err.message, variant: "destructive" });
    }
  };

  const markOverdue = async (paymentId: string, tenantId: string) => {
    try {
      await api.patch(`/api/payments/${paymentId}`, { status: "expired" as PaymentStatus });
      await api.patch(`/api/subscriptions/${tenantId}`, { status: "overdue" });

      toast({ title: "Marcado como vencido" });
      await fetchPayments();
    } catch (err: any) {
      toast({ title: "Erro ao marcar como vencido", description: err.message, variant: "destructive" });
    }
  };

  const generatePlanCharge = async (tenantId: string, subscriptionId: string) => {
    try {
      const data = await api.post<{ error?: string; amount?: number; due_date?: string }>("/api/payments/pix", {
        action: "generate_plan_charge",
        tenant_id: tenantId,
        subscription_id: subscriptionId,
      });
      if (data?.error) {
        toast({ title: "Erro ao gerar cobrança", description: data.error, variant: "destructive" });
        return null;
      }
      toast({ title: "Cobrança PIX gerada!", description: `Valor: R$ ${data.amount?.toFixed(2)} • Vencimento: ${data.due_date}` });
      await fetchPayments();
      return data;
    } catch (err: any) {
      toast({ title: "Erro ao gerar cobrança Asaas", description: err.message, variant: "destructive" });
      return null;
    }
  };

  return { payments, loading, fetchPayments, confirmPayment, blockSubscription, markOverdue, generatePlanCharge };
}
