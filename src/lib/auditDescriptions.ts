const actionDescriptions: Record<string, string> = {
  seller_created: "Novo vendedor cadastrado",
  seller_updated: "Dados do vendedor atualizados",
  operator_created: "Novo operador cadastrado",
  operator_updated: "Dados do operador atualizados",
  payment_action: "Acao de pagamento realizada",
  webhook_received: "Webhook recebido",
  webhook_asaas: "Webhook Asaas processado",
  tenant_updated: "Dados da empresa atualizados",
  tenant_created: "Nova empresa cadastrada",
  login: "Login realizado",
  create: "Registro criado",
  update: "Registro atualizado",
  delete: "Registro removido",
};

const entityLabels: Record<string, string> = {
  seller: "Vendedor",
  operator: "Operador",
  payment: "Pagamento",
  webhook: "Webhook",
  tenant: "Empresa",
  subscription: "Assinatura",
  order: "Pedido",
  product: "Produto",
};

export function describeAuditEntry(
  action: string,
  entityType: string,
  details: Record<string, unknown>
): string {
  // Try specific action description
  const desc = actionDescriptions[action];
  if (desc) {
    // Enrich with URL context
    const url = details?.url as string;
    if (url) {
      if (url.includes('/pix')) return action === 'payment_action' ? 'Pagamento PIX gerado' : desc;
      if (url.includes('sync')) return 'Sincronizacao de pagamento';
      if (url.includes('/webhook')) return 'Webhook processado';
    }
    return desc;
  }

  // Fallback: entity + action
  const entity = entityLabels[entityType] || entityType;
  return `${entity}: ${action}`;
}

export function getEntityLabel(entityType: string): string {
  return entityLabels[entityType] || entityType;
}

export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    seller_created: "Criacao",
    seller_updated: "Atualizacao",
    operator_created: "Criacao",
    payment_action: "Pagamento",
    webhook_received: "Webhook",
    webhook_asaas: "Webhook",
    tenant_updated: "Atualizacao",
    create: "Criacao",
    update: "Atualizacao",
    delete: "Remocao",
    login: "Login",
  };
  return labels[action] || action;
}
