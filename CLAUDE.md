# DropCenter — Development Rules

## Security Rules (MANDATORY)

### Never Trust the Frontend
- ALL input validation MUST happen server-side with Zod schemas
- Frontend validation is UX only — the backend is the single source of truth
- NEVER accept tenant_id, user_id, or role from the frontend body — derive from JWT
- NEVER expose internal IDs, stack traces, or error details to the client

### Authentication & Authorization
- Every endpoint MUST have `authMiddleware` + role check via `requireRole()`
- Webhook endpoints MUST validate tokens with timing-safe comparison
- Tenant isolation is enforced at BOTH middleware AND database (RLS) layers
- Migration to Clerk auth is planned — do NOT add new custom auth code

### Data Security
- Sensitive data (CPF, CNPJ, PIX codes) MUST be encrypted at rest via `encrypt()`/`decrypt()`
- NEVER log secrets, tokens, API keys, or PII — use logger redaction
- NEVER hardcode env vars — all secrets via `env.ts` Zod-validated schema
- NEVER return `SELECT *` — explicitly list only needed columns
- SQL queries MUST use parameterized queries ($1, $2) — NEVER string concatenation

### Operations & Reliability
- Financial operations MUST use database transactions (`withTransaction()`)
- Webhook handlers MUST be idempotent — check before processing
- Amount validation: `isFinite`, min/max bounds, 2 decimal places max
- Rate limiting: global 100/min + per-endpoint limits on sensitive routes

### Multi-tenancy
- ALL queries on tenant-scoped tables MUST include `WHERE tenant_id = $N`
- RLS policies are the last line of defense — app layer is the first
- NEVER allow cross-tenant data access — validate tenant ownership in every query

## Development Workflow (GSD-inspired)

### Before Writing Code
1. Read existing code before modifying — understand patterns
2. Check if a utility/function already exists before creating new ones
3. Plan changes that touch 3+ files before implementing

### While Writing Code
- Atomic commits — one logical change per commit
- Server-side validation for EVERY endpoint that accepts user input
- No unused imports, no dead code, no TODO comments in production
- Error handling at system boundaries — trust internal code

### After Writing Code
- Verify the change works end-to-end
- Check for security implications (auth, tenant isolation, injection)
- Financial changes require extra scrutiny — test edge cases

## Architecture

- **Backend**: Fastify + TypeScript + PostgreSQL + Zod validation
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Auth**: Custom JWT (migrating to Clerk)
- **Payments**: Asaas API (PIX) with webhook confirmation
- **Storage**: MinIO (S3-compatible) for product images
- **Real-time**: SSE via PostgreSQL LISTEN/NOTIFY

## Key Patterns

- `server/src/middleware/auth.ts` — JWT validation middleware
- `server/src/middleware/rbac.ts` — Role-based access control
- `server/src/middleware/tenantScope.ts` — Tenant isolation
- `server/src/middleware/validateBody.ts` — Zod body validation
- `server/src/lib/crypto.ts` — AES-256-GCM encryption
- `server/src/lib/db.ts` — Database queries + transactions
