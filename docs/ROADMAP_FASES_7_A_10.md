# Roadmap — Fases 7 a 10

## Fase 7 — Integração Mercado Livre

**Objetivo:** Conectar vendedores ao Mercado Livre para publicação de anúncios e sincronização de pedidos.

### Escopo

#### 7.1 — Infraestrutura (Backend)
- **Tabela `ml_credentials`**: armazena tokens OAuth por vendedor (`tenant_id`, `access_token`, `refresh_token`, `expires_at`, `ml_user_id`, `ml_nickname`)
- **Tabela `ml_listings`**: vincula produto do catálogo master a um anúncio ML (`product_id`, `tenant_id`, `ml_item_id`, `title`, `price`, `status`, `category_id`, `sync_status`, `last_sync_at`)
- **Edge Function `ml-oauth`**: fluxo OAuth2 completo (redirect → callback → salvar tokens)
- **Edge Function `ml-refresh-token`**: renovação automática de tokens expirados
- **Edge Function `ml-sync`**: publicação/atualização de anúncios e sincronização de pedidos via webhooks

#### 7.2 — Portal do Vendedor
- **`/seller/integracao`** — Página de conexão com ML
  - Botão "Conectar Mercado Livre" → inicia fluxo OAuth
  - Status da conexão (conectado/desconectado, nickname ML, data de expiração)
  - Botão "Desconectar" com confirmação
- **`/seller/anuncios`** — Gestão de Anúncios
  - Lista de anúncios publicados com status (ativo, pausado, finalizado)
  - Criar novo anúncio: selecionar produto do catálogo → preencher atributos ML obrigatórios (marca, modelo, etc.) → calculadora de preço final → publicar
  - Ações: pausar, reativar, editar preço, sincronizar estoque
  - Indicadores: vendas por anúncio, visitas, conversão

#### 7.3 — Portal Interno (Admin)
- Visão consolidada de todos os anúncios de todos os vendedores
- Monitoramento de status de integração por vendedor
- Logs de sincronização e erros

### Páginas afetadas
| Rota | Status atual | Ação |
|------|-------------|------|
| `/seller/integracao` | Placeholder | Implementar |
| `/seller/anuncios` | Placeholder | Implementar |

---

## Fase 8 — Logística, Expedição & Portal do Operador ✅ CONCLUÍDA

**Objetivo:** Gerenciar o fluxo físico de pedidos no galpão — da separação à expedição — com um portal dedicado para operadores.

### Entregas

#### 8.1 — Role `operator` ✅
- `'operator'` adicionado ao enum `app_role`
- Tela de cadastro de operadores (admin) em `/operadores`
- Edge Function `create-operator` para criação segura
- Acesso restrito apenas ao portal de operação

#### 8.2 — Portal do Operador (`/operacao`) ✅
- **Dashboard** (`/operacao`): cards de fila, em andamento, concluídos hoje, tempo médio
- **Separação** (`/operacao/separacao`): agrupamento por SKU/categoria, seleção em lote (até 50), impressão de etiquetas via API ML
- **Embalagem** (`/operacao/embalagem`): bipagem por código de envio (`ml_shipment_id`), conferência visual (foto, SKU, nome), timer de produtividade, finalização via Enter, trava contra re-embalagem
- **Expedição**: área de pacotes aguardando retirada com contagem

#### 8.3 — Dashboard de Logística (Admin) ✅
- `/logistica` com pipeline visual: Aguardando → Separando → Embalando → Etiquetado → Expedido
- Métricas de performance e volume

#### 8.4 — Automação via Webhook ✅
- Pedido aprovado (`orders_v2`) → cria `shipment` + `picking_task` automaticamente
- Tabelas `shipments` e `picking_tasks` com RLS por tenant
- Edge Function `ml-shipping-label` para geração de etiquetas

#### 8.5 — Status Operacionais ✅
- Mapeamento completo: `picking` (Separando), `packing` (Embalando), `packed` (Aguardando Retirada), `labeled` (Etiquetado)
- Filtros e badges nas telas de Pedidos (admin e vendedor)
- Card "Em Andamento" reflete todo o pipeline operacional

---

## Fase 9 — Relatórios & BI

**Objetivo:** Oferecer dashboards analíticos avançados para admin e vendedores.

### Escopo

#### 9.1 — Portal Interno (Admin) — `/relatorios`
- **Vendas**: faturamento por período, por vendedor, por produto, por categoria
- **Estoque**: giro de estoque, produtos parados, previsão de ruptura
- **Financeiro**: receita de assinaturas, inadimplência, projeções
- **Operação**: tempo médio de fulfillment, pedidos/hora, produtividade por operador
- **Marketplace**: anúncios ativos, taxa de conversão, GMV por vendedor
- Exportação de relatórios (CSV/PDF)
- Filtros por período, vendedor, categoria, status

#### 9.2 — Portal do Vendedor — `/seller/relatorios`
- **Minhas Vendas**: pedidos por período, ticket médio, produtos mais vendidos
- **Meus Anúncios**: performance no ML (visitas, conversão, posicionamento)
- **Financeiro**: histórico de pagamentos, próximas faturas
- Gráficos comparativos (mês atual vs anterior)

### Páginas afetadas
| Rota | Status atual | Ação |
|------|-------------|------|
| `/relatorios` | Placeholder | Implementar (admin) |
| `/seller/relatorios` | Placeholder | Implementar (vendedor) |

---

## Fase 10 — Atendimento, Mensagens & Configurações

**Objetivo:** Centralizar comunicação e finalizar configurações do sistema.

### Escopo

#### 10.1 — Atendimento & Mensagens — `/atendimento`
- Inbox centralizado de mensagens do Mercado Livre (perguntas e pós-venda)
- Atribuição de mensagens para vendedores ou equipe interna
- Templates de resposta rápida
- Histórico de conversas por pedido/anúncio
- Notificações de novas mensagens

#### 10.2 — Configurações — `/configuracoes`
- **Dados da empresa**: nome, CNPJ, logo, endereço do galpão
- **Usuários & Permissões**: gestão de admins, gerentes e operadores
- **Integrações**: credenciais ML da plataforma (app_id, client_secret), webhooks
- **Financeiro**: configuração de PIX, planos, regras de bloqueio
- **Notificações**: preferências de alertas (email, push)
- **Sistema**: logs de auditoria, backup

#### 10.3 — Configurações do Vendedor — `/seller/configuracoes`
- Já parcialmente implementada (perfil + senha)
- Adicionar: preferências de notificação, dados fiscais

### Páginas afetadas
| Rota | Status atual | Ação |
|------|-------------|------|
| `/atendimento` | Placeholder | Implementar |
| `/configuracoes` | Placeholder | Implementar |
| `/seller/configuracoes` | Implementada (parcial) | Expandir |

---

## Resumo de Roles por Portal

| Role | Portal Interno | Portal Vendedor | Portal Operação |
|------|---------------|----------------|-----------------|
| `admin` | ✅ Acesso total | ✅ Pode visualizar | ✅ Pode visualizar |
| `manager` | ✅ Acesso total | ✅ Pode visualizar | ✅ Pode visualizar |
| `seller` | ❌ Bloqueado | ✅ Acesso total | ❌ Bloqueado |
| `operator` | ❌ Bloqueado | ❌ Bloqueado | ✅ Acesso total |

---

## Ordem de Execução Recomendada

```
Fase 7 → Fase 8 → Fase 9 → Fase 10
  ML       Galpão    BI      Atendimento
```

Cada fase é incremental e independente, permitindo entregas parciais e testes por módulo.
