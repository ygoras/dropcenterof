# DropCenter — Documentacao Completa

## Visao Geral

DropCenter e uma plataforma multi-tenant de operacao dropshipping com integracao ao Mercado Livre. Permite que vendedores publiquem anuncios, recebam pedidos, e operadores processem separacao e embalagem.

**Stack:**
- Frontend: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- Backend: Fastify + TypeScript + PostgreSQL
- Auth: Clerk (producao)
- Pagamentos: Asaas (PIX)
- Marketplace: Mercado Livre API
- Storage: MinIO (S3-compatible)
- Real-time: SSE via PostgreSQL LISTEN/NOTIFY
- Deploy: Docker Compose + Nginx + Let's Encrypt

---

## 3 Portais

### Portal Admin
Acesso: roles `admin` ou `manager`
- Dashboard operacional com KPIs em tempo real
- Gestao de vendedores (criar, ativar/desativar)
- Catalogo master de produtos
- Estoque/WMS
- Pedidos de todos os vendedores
- Visao geral Mercado Livre
- Alertas ML (estoque baixo, erros de sync)
- Logistica (picking, shipping)
- Gestao de operadores
- Financeiro (carteiras de todos os vendedores)
- Planos e assinaturas
- Relatorios e BI
- Auditoria (logs de operacoes sensiveis)
- Configuracoes

### Portal Vendedor
Acesso: role `seller` + assinatura ativa
- Dashboard com KPIs do vendedor
- Integracao Mercado Livre (OAuth)
- Catalogo (ver produtos disponiveis)
- Anuncios (publicar, pausar, sincronizar)
- Pedidos recebidos
- Credito e carteira (recarga via PIX)
- Meu plano (assinatura, pagamento)
- Envio/frete (configuracao)
- Relatorios
- Suporte
- Configuracoes (perfil, CPF/CNPJ, dados fiscais)

### Portal Operador
Acesso: role `operator`
- Dashboard de operacao (KPIs do galpao)
- Separacao de produtos (picking)
- Bancada de embalagem (packing)

---

## Fluxos Criticos

### 1. Autenticacao (Clerk)

```
Usuario acessa /login
  -> Digita email + senha
  -> Clerk autentica (Client Trust pode pedir codigo por email)
  -> Clerk retorna session token
  -> AuthContext busca /api/auth/me
  -> Backend: verifyToken() do Clerk -> busca profile no DB
  -> Seta request.user = { sub, email, roles, tenantId }
  -> Seta RLS context via AsyncLocalStorage
  -> Frontend redireciona por role:
     admin/manager -> /dashboard
     seller -> /seller/dashboard
     operator -> /operacao
```

### 2. Criacao de Vendedor

```
Admin acessa /vendedores -> Novo Vendedor
  -> Preenche: nome, email, senha, empresa, plano
  -> POST /api/users/sellers
  -> Backend:
     1. Cria tenant (empresa) com slug unico
     2. Cria user no Clerk (clerkClient.users.createUser)
     3. Cria auth_user no DB com clerk_user_id
     4. Cria profile vinculado ao tenant
     5. Cria user_role = 'seller'
     6. Cria subscription com status = 'pending'
     7. billing_day = dia atual
  -> Vendedor recebe email do Clerk para definir senha
  -> Vendedor faz login -> ve "Ative sua assinatura"
  -> Vendedor acessa /seller/plano -> gera PIX
  -> Paga PIX -> webhook Asaas ativa subscription
  -> Acesso liberado
```

### 3. Publicacao de Anuncio no ML

```
Vendedor acessa /seller/catalogo
  -> Ve produtos do catalogo master
  -> Clica em "Anunciar"
  -> Preenche: tipo (classico/premium), markup, impostos
  -> Sistema calcula: preco final, comissao ML, frete estimado
  -> POST /api/ml/sync?action=publish
  -> Backend:
     1. Busca credenciais ML do vendedor
     2. Monta payload do item (titulo, preco, imagens, categoria)
     3. POST https://api.mercadolibre.com/items
     4. Recebe ml_item_id
     5. INSERT ml_listings (status='active', sync_status='synced')
     6. Busca custos reais via /items/{id}/shipping_options (retry 2s)
     7. Atualiza fees e frete reais
  -> ML envia webhook quando anuncio muda de status
  -> Backend processa -> atualiza listing -> SSE notifica frontend
```

### 4. Recarga de Carteira via PIX

```
Vendedor acessa /seller/credito -> Recarregar via PIX
  -> Escolhe valor (ou digita custom)
  -> POST /api/payments/pix { action: "generate_pix", amount: 100 }
  -> Backend:
     1. Valida CPF/CNPJ no tenant (obrigatorio para Asaas)
     2. Cria/busca customer no Asaas
     3. Cria cobranca PIX no Asaas
     4. Busca QR Code via /payments/{id}/pixQrCode
     5. Criptografa pix_code e pix_qr_image (AES-256-GCM)
     6. INSERT wallet_transactions (status='pending')
  -> Frontend mostra QR Code + "Aguardando pagamento..."
  -> Polling a cada 5s: check_charge_status
  -> Vendedor paga PIX no banco
  -> Asaas envia webhook PAYMENT_CONFIRMED
  -> Backend:
     1. Valida token (timing-safe comparison)
     2. Parse externalReference = 'wallet:tenant_id'
     3. Idempotency check (ja processado?)
     4. Transaction atomica:
        - UPDATE wallet_balances SET balance = balance + amount
        - UPDATE wallet_transactions SET status = 'confirmed'
     5. Processa fila de pedidos pending_credit
     6. Cria notificacao
  -> Frontend detecta status='confirmed'
  -> Modal mostra "Pagamento Recebido!" com check verde
  -> Auto-fecha e atualiza saldo
```

### 5. Fluxo de Pedido (ML -> Operador)

```
Comprador compra no Mercado Livre
  -> ML envia webhook topic='orders_v2'
  -> Backend:
     1. Busca detalhes do pedido na API ML
     2. INSERT orders (status='pending')
     3. Debita custo do produto da carteira do vendedor
     4. Se saldo suficiente: status='approved'
     5. Se saldo insuficiente: status='pending_credit'
     6. Cria picking_task (status='pending')
     7. Notifica vendedor + SSE

  -> Operador acessa /operacao/separacao
     1. Ve lista de pedidos aguardando separacao
     2. Seleciona pedido -> marca como "em separacao"
     3. Separa SKUs fisicamente
     4. Marca como "separado"

  -> Operador acessa /operacao/embalagem
     1. Bipa codigo de barras da etiqueta ML
     2. Timer de desempenho inicia
     3. Embala o pedido
     4. Pressiona Enter -> timer para, status = "aguardando retirada"

  -> ML coleta o pacote
     -> Webhook topic='shipments' atualiza status
     -> Backend: UPDATE shipments SET status='shipped'
     -> Webhook topic='shipments' quando entregue
     -> Backend: UPDATE shipments SET status='delivered'
```

### 6. Pagamento de Assinatura

```
Admin cria vendedor -> subscription status = 'pending'
  -> Vendedor faz login -> ve "Ative sua assinatura"
  -> Clica "Ir para Meu Plano" -> /seller/plano
  -> Ve banner "Ative sua assinatura" + botao "Gerar PIX"
  -> POST /api/payments/pix { action: "generate_subscription_pix" }
  -> Backend:
     1. Busca subscription + plan do vendedor
     2. Se ja tem payment pendente com mesmo valor, reutiliza
     3. Senao, cria cobranca PIX no Asaas
     4. externalReference = 'plan:tenant_id:subscription_id'
     5. INSERT payments (status='pending')
  -> QR Code aparece com polling
  -> Vendedor paga
  -> Webhook confirma:
     1. UPDATE payments SET status='confirmed'
     2. UPDATE subscriptions SET status='active'
     3. UPDATE profiles SET is_active=true
     4. Notifica vendedor
  -> ProtectedRoute detecta subscription='active'
  -> Acesso total liberado
```

---

## Seguranca — 7 Camadas

### Camada 1: Clerk Authentication
- Tokens JWT assinados pelo Clerk
- Client Trust (codigo por email em dispositivos novos)
- Session management automatico (refresh a cada 50s)

### Camada 2: RBAC (Role-Based Access Control)
- Middleware `requireRole()` em cada rota
- Roles: admin, manager, seller, operator, viewer
- Admin/manager acessam tudo
- Seller so acessa rotas /seller/*
- Operator so acessa rotas /operacao/*

### Camada 3: Subscription Guard
- Hook global que bloqueia sellers sem assinatura ativa
- Whitelist: auth, payments, plans, subscriptions, notifications
- Retorna 403 SUBSCRIPTION_INACTIVE

### Camada 4: Row-Level Security (PostgreSQL)
- 12 tabelas com RLS ativo + FORCE
- Policies: admin_bypass + tenant_isolation
- SET LOCAL app.tenant_id e app.is_admin em cada query
- Sellers so veem dados do proprio tenant

### Camada 5: Zod Validation
- Todos os endpoints que aceitam body usam schemas Zod
- Amount: min 1, max 50000, isFinite
- Email: formato valido
- UUID: formato valido
- Strict mode: rejeita campos desconhecidos

### Camada 6: Rate Limiting
- Global: 100 req/min por IP
- Payments: 10 req/min por user ID
- Auth: 5 login/min, 3 register/min

### Camada 7: Encryption
- AES-256-GCM para dados sensiveis
- CPF/CNPJ criptografado no banco
- PIX codes e QR images criptografados
- ENCRYPTION_KEY: 64 hex chars (32 bytes)
- Webhook tokens: timing-safe comparison

---

## Webhooks

### Asaas (Pagamentos)
- URL: /api/webhooks/asaas -> proxy -> /api/payments/webhook
- Auth: header `asaas-access-token` (timing-safe)
- Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED
- Idempotency: verifica se ja processou antes de creditar

### Clerk (Usuarios)
- URL: /api/webhooks/clerk
- Auth: Svix signature (HMAC-SHA256 + replay protection 5min)
- Eventos: user.created, user.updated, user.deleted
- Sync: cria/atualiza/desativa profiles no DB

### Mercado Livre (Marketplace)
- URL: /api/webhooks/ml
- Auth: responde em <500ms (requisito ML)
- Topicos: items, orders_v2, shipments, questions
- Processamento assincrono apos resposta 200

---

## Banco de Dados

### Tabelas principais
- `auth_users` — usuarios (clerk_user_id)
- `profiles` — perfis (tenant_id, nome, email)
- `user_roles` — roles (admin, seller, operator)
- `tenants` — empresas (nome, slug, document criptografado)
- `products` — produtos do catalogo
- `stock` — estoque (quantity, reserved, min_stock)
- `orders` — pedidos
- `picking_tasks` — tarefas de separacao
- `shipments` — envios
- `ml_credentials` — tokens ML por vendedor
- `ml_listings` — anuncios no ML
- `plans` — planos disponiveis
- `subscriptions` — assinaturas dos vendedores
- `payments` — cobrangas de plano
- `wallet_balances` — saldo da carteira
- `wallet_transactions` — historico de transacoes
- `notifications` — notificacoes
- `audit_logs` — logs de auditoria
- `support_tickets` + `support_messages` — suporte

### Funcoes PostgreSQL
- `credit_wallet()` — credita saldo atomicamente
- `debit_wallet()` — debita saldo atomicamente
- `process_pending_credit_orders()` — libera pedidos bloqueados
- `create_notification()` — cria notificacao (auto-cleanup 100/tenant)
- `notify_table_change()` — trigger para SSE real-time

### RLS (12 tabelas)
products, orders, wallet_transactions, wallet_balances, notifications, subscriptions, payments, ml_credentials, ml_listings, shipments, support_tickets, stock

---

## Testes

### 45 testes automatizados (Vitest)
- **Security** (29): whitelist routes, amount validation, webhook tokens, tenant isolation, RBAC, encryption key
- **Pagination** (5): defaults, limits, NaN handling
- **Webhook** (11): Asaas token, Clerk Svix signature, event parsing, replay protection

### Pre-push hook
- Roda `npm test` automaticamente antes de cada `git push`
- Se falhar, push e bloqueado

---

## Deploy

### VPS (Ubuntu 22)
- Docker Compose: nginx, api, postgres, minio
- SSL: Let's Encrypt (auto-renewal)
- Dominio: login.dropcenter.com.br

### Comandos de deploy
```bash
# Frontend + Backend
cd ~/dropcenter && git pull && npm run build && cd server && docker compose build --no-cache api && docker compose up -d

# So frontend
cd ~/dropcenter && git pull && npm run build

# So backend
cd ~/dropcenter && git pull && cd server && docker compose build --no-cache api && docker compose up -d

# Nginx (apos mudar nginx.conf)
cd ~/dropcenter/server && docker compose restart nginx

# Migration SQL
docker compose exec postgres psql -U dropcenter -d dropcenter -f /tmp/migration.sql

# Ver logs
cd ~/dropcenter/server && docker compose logs api -f --tail=20
```

---

## Variaveis de Ambiente

### Backend (server/.env)
```
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_... (optional)
APP_URL=https://login.dropcenter.com.br
APP_PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://login.dropcenter.com.br
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=product-images
MINIO_USE_SSL=false
ML_APP_ID=...
ML_CLIENT_SECRET=...
ASAAS_API_KEY='$aact_...'
ASAAS_WEBHOOK_TOKEN=whsec_...
ASAAS_SANDBOX=false
BILLING_CRON_SECRET=...
ENCRYPTION_KEY=64_hex_chars
```

### Frontend (.env.production)
```
VITE_API_URL=https://login.dropcenter.com.br
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```
