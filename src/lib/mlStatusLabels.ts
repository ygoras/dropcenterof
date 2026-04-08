export const mlStatusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  paid: "Pago",
  payment_required: "Pgto. Pendente",
  payment_in_process: "Pgto. em Processo",
  partially_paid: "Pgto. Parcial",
  partially_refunded: "Reembolso Parcial",
  pending_cancel: "Cancelamento Pendente",
  cancelled: "Cancelado",
  shipped: "Enviado",
  delivered: "Entregue",
};

export const claimStatusLabels: Record<string, { label: string; color: string }> = {
  opened: { label: "Reclamacao Aberta", color: "bg-red-500/10 text-red-500 border-red-500/30" },
  closed: { label: "Reclamacao Encerrada", color: "bg-muted text-muted-foreground border-border" },
  resolved: { label: "Reclamacao Resolvida", color: "bg-green-500/10 text-green-500 border-green-500/30" },
};

export function getMlStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return mlStatusLabels[status] || status;
}

export function getClaimBadge(claimStatus: string | null | undefined, orderStatus: string): { label: string; color: string } | null {
  if (!claimStatus || claimStatus === 'closed' || claimStatus === 'resolved') return null;
  // Claim aberta
  const statusPriority = ['pending', 'pending_credit', 'approved', 'confirmed'];
  if (statusPriority.includes(orderStatus)) {
    // Etiqueta ainda nao impressa — alerta forte
    return { label: "Reclamacao — Separacao Bloqueada", color: "bg-red-500/10 text-red-500 border-red-500/30" };
  }
  // Ja em andamento ou enviado — informativo
  return { label: "Reclamacao Aberta", color: "bg-orange-500/10 text-orange-500 border-orange-500/30" };
}
