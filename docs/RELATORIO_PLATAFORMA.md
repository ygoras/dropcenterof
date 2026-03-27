# Relatório Completo — Plataforma DropCenter

**Data**: 13/02/2026  
**Status Geral**: Fases 1 a 10 concluídas ✅ | PWA Global ✅ | Responsivo ✅

---

## 1. Visão Geral

A **DropCenter** é uma plataforma multi-tenant de fulfillment e marketplace que conecta vendedores ao Mercado Livre, gerenciando catálogo, estoque, pedidos, logística, financeiro e carteira de créditos a partir de um galpão centralizado.

### Arquitetura
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions + Realtime + Storage)
- **Integrações**: API Mercado Livre (OAuth2, Anúncios, Pedidos, Webhooks, Envios, Etiquetas)
- **Pagamentos**: Asaas (PIX QR Code, Webhooks de confirmação)
- **PWA**: Instalável em qualquer dispositivo (PC, tablet, mobile) via `vite-plugin-pwa`

---

## 2. Status de Todas as Fases

| Fase | Descrição | Status | Testado E2E |
|------|-----------|--------|-------------|
| 1 | Auth + Multi-tenant + RBAC | ✅ | ✅ |
| 2 | Catálogo Master | ✅ | ✅ |
| 3 | Gestão de Vendedores | ✅ | ✅ |
| 4 | Portal do Vendedor | ✅ | ✅ |
| 5 | Financeiro & Assinaturas | ✅ | ✅ |
| 6 | Dashboard & Cockpit | ✅ | ✅ |
| 7 | Integração Mercado Livre | ✅ | ✅ |
| 8 | Logística, WMS & Operadores | ✅ | ✅ |
| 9 | Relatórios & BI | ✅ | ✅ |
| 10 | Atendimento, Config & Auditoria | ✅ | ✅ |

---

## 3. Roles & Controle de Acesso (RBAC)

| Role | Portal Interno | Portal Vendedor | Portal Operação |
|------|---------------|----------------|-----------------|
| `admin` | ✅ Total | ✅ Visualizar | ✅ Visualizar |
| `manager` | ✅ Total | ✅ Visualizar | ✅ Visualizar |
| `seller` | ❌ → `/seller/dashboard` | ✅ Total | ❌ |
| `operator` | ❌ → `/operacao` | ❌ | ✅ Total |

- Roles armazenadas em `user_roles` com função `has_role()` SECURITY DEFINER
- Bloqueio automático para sellers com assinatura `blocked`

---

## 4. Mapeamento Completo de Páginas

### Portal Interno (Admin/Manager) — 14 páginas

| Rota | Página | Descrição | Responsivo |
|------|--------|-----------|------------|
| `/dashboard` | Dashboard.tsx | KPIs globais, pipeline de pedidos, alertas, performance | ✅ |
| `/vendedores` | Vendedores.tsx | CRUD sellers, planos, status, toggle ativo/inativo | ✅ |
| `/catalogo` | Catalogo.tsx | Produtos, categorias, imagens, atributos ML, CRUD completo | ✅ |
| `/estoque` | Estoque.tsx | WMS, reservas, alertas estoque baixo, ajuste manual | ✅ |
| `/pedidos` | Pedidos.tsx | Todos os pedidos, filtros por status (inc. pending_credit), ações | ✅ |
| `/mercadolivre` | AdminMercadoLivre.tsx | Visão consolidada de anúncios ML de todos os sellers | ✅ |
| `/alertas-ml` | AlertasML.tsx | Monitoramento de erros e sincronizações ML | ✅ |
| `/logistica` | Logistica.tsx | Pipeline visual de expedição com tabs | ✅ |
| `/operadores` | Operadores.tsx | Cadastro e gestão de operadores logísticos | ✅ |
| `/atendimento` | Atendimento.tsx | Tickets de suporte admin ↔ vendedor com chat realtime | ✅ |
| `/financeiro` | Financeiro.tsx | Assinaturas, PIX, faturas, confirmação/bloqueio | ✅ |
| `/relatorios` | Relatorios.tsx | BI: vendas por vendedor, SKU, categoria, produtividade | ✅ |
| `/auditoria` | AuditLog.tsx | Logs de ações críticas do sistema | ✅ |
| `/configuracoes` | Configuracoes.tsx | 4 abas: Empresa, Galpão, Usuários, Notificações | ✅ |

### Portal do Vendedor — 10 páginas

| Rota | Página | Descrição | Responsivo |
|------|--------|-----------|------------|
| `/seller/dashboard` | SellerDashboard.tsx | KPIs pessoais, alertas de saldo baixo e pedidos bloqueados | ✅ |
| `/seller/integracao` | SellerIntegracao.tsx | OAuth ML (conectar/desconectar conta) | ✅ |
| `/seller/catalogo` | SellerCatalogo.tsx | Grid de produtos com calculadora de preço ML | ✅ |
| `/seller/anuncios` | SellerAnuncios.tsx | Gestão de anúncios ML (criar, pausar, editar preço) | ✅ |
| `/seller/envio` | SellerEnvio.tsx | Endereço de coleta + simulador de frete | ✅ |
| `/seller/pedidos` | SellerPedidos.tsx | Pedidos por tenant com filtro "Pendente Crédito" | ✅ |
| `/seller/credito` | SellerCredito.tsx | Carteira: saldo, recarga PIX, histórico, projeção de gastos | ✅ |
| `/seller/relatorios` | SellerRelatorios.tsx | Relatório financeiro detalhado por SKU | ✅ |
| `/seller/atendimento` | SellerAtendimento.tsx | Tickets de suporte com chat bidirecional | ✅ |
| `/seller/configuracoes` | SellerConfiguracoes.tsx | 3 abas: Perfil, Dados Fiscais, Segurança | ✅ |

### Portal do Operador — 3 páginas (PWA otimizado)

| Rota | Página | Descrição | Responsivo |
|------|--------|-----------|------------|
| `/operacao` | Operacao.tsx | Dashboard operacional com tabs | ✅ |
| `/operacao/separacao` | OperacaoSeparacao.tsx | Separação por SKU com bipagem | ✅ |
| `/operacao/embalagem` | OperacaoEmbalagem.tsx | Embalagem com conferência, timer e finalização | ✅ |

---

## 5. Funcionalidades-Chave Implementadas

### 5.1 Integração Mercado Livre (Fase 7)
- **OAuth2 completo** com refresh automático de tokens
- **Publicação** de anúncios com tipo (Premium/Clássica) e calculadora de preço
- **Pausa/Reativação** de anúncios
- **Calculadora de preço final**: taxas ML + frete + margem sobre custo
- **Sincronização de pedidos** via webhooks (`orders_v2`)
- **Pausa automática** de anúncios por estoque zero
- **Geração de etiquetas** de envio via API ML

#### Edge Functions de Integração ML:
| Função | Descrição |
|--------|-----------|
| `ml-oauth` | Fluxo OAuth2 (code → access_token + refresh_token) |
| `ml-refresh-token` | Renova token expirado automaticamente |
| `ml-sync` | Sincroniza anúncios do ML com a base local |
| `ml-categories` | Busca categorias do ML para mapeamento |
| `ml-price-update` | Atualiza preço de anúncio no ML |
| `ml-shipping-cost` | Simula custo de frete via API ML |
| `ml-shipping-label` | Gera etiqueta de envio |
| `ml-webhook` | Recebe notificações do ML (pedidos, pagamentos, envios) |
| `ml-disconnect` | Remove credenciais ML do vendedor |

### 5.2 WMS & Logística (Fase 8)
- **Pipeline**: Aguardando → Separando → Embalando → Etiquetado → Expedido
- **Separação por SKU** com agrupamento inteligente
- **Embalagem** com bipagem, conferência visual e timer
- **Geração de etiquetas** via API ML
- **Automação via webhook** (`orders_v2`)
- **Operadores dedicados** com cadastro e atribuição

### 5.3 Relatórios & BI (Fase 9)
- **4 abas**: Por Vendedor, Por SKU, Por Categoria, Produtividade
- **Filtros globais**: período (7/30/90 dias ou custom), vendedor, categoria
- **Análise financeira**: lucro líquido = faturamento − custo − taxas ML − frete
- **Gráficos** de evolução diária (Revenue vs Net Profit) via Recharts
- Vendedor acessa apenas dados do próprio tenant (RLS)

### 5.4 Atendimento & Auditoria (Fase 10)
- **Tickets**: chat bidirecional admin ↔ vendedor com prioridade e categorias
- **Realtime**: atualização instantânea via Supabase Realtime (tickets + mensagens)
- **Auditoria**: `logAudit()` integrado em ações críticas
- **Configurações**: dados fiscais do vendedor (Razão Social, IE, IM, Regime Tributário)

### 5.5 Carteira de Créditos & PIX (Módulo Financeiro do Vendedor)
- **Wallet**: saldo em tempo real com débito automático por pedido aprovado
- **Recarga via PIX**: QR Code gerado via Asaas (Edge Function `asaas-pix`)
- **Projeção de gastos**: cálculo de dias restantes baseado na média de vendas
- **Status `pending_credit`**: pedidos bloqueados por falta de saldo, liberados automaticamente após recarga
- **Alertas visuais**: no sidebar e dashboard do vendedor quando saldo < 7 dias

#### Edge Functions Financeiras:
| Função | Descrição |
|--------|-----------|
| `asaas-pix` | Gera QR Code PIX, consulta saldo, calcula projeção de gastos |
| `asaas-webhook` | Processa confirmação de pagamento, credita saldo, libera pedidos |

### 5.6 Sistema de Notificações In-App
- **Centro de Notificações**: sino no topbar com dropdown e contagem de não lidas
- **Tipos**: `low_balance`, `order_blocked`, `payment_confirmed`, `orders_released`
- **Realtime**: notificações aparecem instantaneamente via Supabase Realtime
- **Tabela**: `notifications` com RLS por user_id e função helper `create_notification()`

### 5.7 PWA Global
- **Instalável** em qualquer dispositivo via browser
- **Offline-capable** com service worker (vite-plugin-pwa)
- **Manifesto** cobrindo toda a aplicação (não apenas operação)
- **Ícones**: 192x192 e 512x512 (maskable)

---

## 6. Tabelas do Banco de Dados

### Tabelas Principais
| Tabela | Descrição |
|--------|-----------|
| `profiles` | Perfis de usuário (nome, email, tenant_id) |
| `user_roles` | Roles por usuário (admin, manager, seller, operator) |
| `tenants` | Multi-tenant (nome, documento, configurações) |
| `products` | Catálogo master de produtos |
| `product_categories` | Categorias de produto |
| `product_images` | Imagens de produto (Supabase Storage) |
| `stock` | Estoque (quantidade, reservas, mínimos) |
| `available_stock` | View materializada de estoque disponível |
| `orders` | Pedidos com status pipeline completo |
| `order_items` | Itens dos pedidos |
| `ml_credentials` | Tokens OAuth do Mercado Livre por tenant |
| `ml_listings` | Anúncios publicados no ML |
| `picking_tasks` | Tarefas de separação/embalagem |
| `shipments` | Envios com tracking e etiquetas |
| `subscriptions` | Assinaturas de planos |
| `plans` | Planos disponíveis |
| `payments` | Cobranças/faturas |
| `tickets` | Tickets de suporte |
| `ticket_messages` | Mensagens de tickets |
| `audit_log` | Log de auditoria |
| `wallet_balances` | Saldo da carteira por tenant |
| `wallet_transactions` | Histórico de transações (débito/crédito) |
| `notifications` | Notificações in-app por usuário |

---

## 7. Integrações de Auditoria Ativas

| Ação | Hook | Entidade |
|------|------|----------|
| Criar vendedor | `useSellers` | `seller` |
| Alterar status pedido | `useOrders` | `order` |
| Ajustar estoque | `useProducts` | `product` |
| Ajustar estoque mínimo | `useProducts` | `product` |

---

## 8. Conexões com o Mercado Livre

### Fluxo OAuth2
1. Vendedor acessa `/seller/integracao` → clica "Conectar"
2. Redirect para ML com `client_id` + `redirect_uri` → `/~oauth`
3. ML retorna `authorization_code`
4. Edge Function `ml-oauth` troca code por `access_token` + `refresh_token`
5. Tokens armazenados em `ml_credentials` (criptografia em trânsito)
6. Refresh automático via `ml-refresh-token` antes de expirar

### Endpoints Conectados à API ML
| Endpoint ML | Uso no DropCenter |
|-------------|-------------------|
| `POST /oauth/token` | Obter/renovar tokens |
| `GET /users/me` | Validar conta conectada |
| `POST /items` | Publicar anúncio |
| `PUT /items/{id}` | Atualizar preço/status |
| `GET /items/{id}` | Sincronizar dados |
| `GET /orders/{id}` | Buscar detalhes do pedido |
| `GET /categories` | Listar categorias ML |
| `POST /shipments/{id}/label` | Gerar etiqueta |
| `GET /shipping/options` | Simular frete |
| Webhook `orders_v2` | Receber notificações de pedidos |

### Dados Sincronizados
- **Pedidos**: status, itens, valor, dados do comprador
- **Anúncios**: título, preço, status, permalink, thumbnail
- **Envios**: código de rastreio, etiqueta, status

---

## 9. Credenciais de Homologação

| Role | Email | Senha |
|------|-------|-------|
| Admin | admin@dropcenter.com.br | 123456 |
| Vendedor | thiago.sosau@icloud.com | 123456 |
| Operador | operador@dropcenter.com.br | 123456 |

---

## 10. Tecnologias Utilizadas

| Tecnologia | Uso |
|------------|-----|
| React 18 | UI framework |
| TypeScript | Tipagem estática |
| Vite | Build tool + HMR |
| Tailwind CSS | Estilização utility-first |
| shadcn/ui | Componentes base |
| Recharts | Gráficos e visualizações |
| React Router v6 | Roteamento SPA |
| TanStack Query | Cache e fetch de dados |
| Supabase JS v2 | Client SDK |
| Supabase Auth | Autenticação |
| Supabase Realtime | WebSockets para tickets e notificações |
| Supabase Storage | Armazenamento de imagens |
| Supabase Edge Functions | Lógica server-side (Deno) |
| vite-plugin-pwa | Progressive Web App |
| Sonner | Toast notifications |
| Lucide React | Ícones |
| date-fns | Manipulação de datas |

---

## 11. Próximos Passos Recomendados

### Fase 11 — Otimização & Produção
1. Configurar API Key do Asaas como secret e testar fluxo PIX completo
2. Exportação CSV/PDF nos relatórios
3. Dashboard de SLA de tickets (tempo médio de resposta)
4. Gráficos comparativos (mês atual vs anterior)
5. Ampliar `logAudit()` para mais ações (login, config, ML sync)
6. Notificações por e-mail (novo ticket, pedido aprovado, saldo baixo)
7. Cron job para verificação diária de saldo baixo

### Fase 12 — Escala
1. Multi-warehouse (múltiplos galpões)
2. API pública para integrações externas
3. Integração com outros marketplaces (Shopee, Amazon)
4. App nativo via Capacitor (opcional)

---

*Documento atualizado em 13/02/2026 — Fases 1–10 concluídas, PWA global ativo, todas as páginas responsivas.*
