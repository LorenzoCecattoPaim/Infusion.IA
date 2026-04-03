# Infusion.IA — Backend (Supabase)

Hub de marketing com IA para PMEs brasileiras. Backend completo com Edge Functions Deno, SQL migrations, RLS e sistema de créditos/pagamentos.

---

## Estrutura

```
supabase/
├── config.toml
├── migrations/
│   ├── 001_core_tables.sql          # Tabelas principais
│   ├── 002_payments_system.sql      # Planos, assinaturas, transações
│   ├── 003_functions_triggers.sql   # Funções PL/pgSQL e triggers
│   └── 004_storage_rls.sql          # Buckets e políticas de storage
└── functions/
    ├── _shared/
    │   ├── agents.ts                # 5 agentes de IA + utilitários
    │   └── monitoring.ts            # Logging estruturado
    ├── ai-chat/                     # Chat streaming com GPT-4o
    ├── generate-image/              # Gerador de imagens (Leonardo AI)
    ├── logo-generator/              # Criador de logos (GPT-4o + Leonardo)
    ├── generate-posts/              # Gerador de posts multi-canal
    ├── buy-credits/                 # Compra de créditos avulsos (Pagar.me)
    ├── upgrade-plan/                # Upgrade de plano (assinatura recorrente)
    ├── recharge-credits/            # Renovação mensal de créditos (cron)
    └── webhook-pagamento/           # Webhook Pagar.me / InfinitePay
```

---

## Setup — Passo a passo

### 1. Instale o Supabase CLI

```bash
npm install -g supabase
# ou
brew install supabase/tap/supabase
```

### 2. Login e vinculação

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
```

### 3. Configure as variáveis de ambiente (Supabase Secrets)

```bash
supabase secrets set AI_API_KEY="sk-..."
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set AI_MODEL_MARKETING="gpt-4o"
supabase secrets set AI_MODEL_LOGO="gpt-4o"
supabase secrets set AI_MODEL_PROMPT_OPT="gpt-4o-mini"
supabase secrets set AI_MODEL_VALIDATOR="gpt-4o-mini"
supabase secrets set LEONARDO_API_KEY="..."
supabase secrets set PAGARME_API_KEY="ak_live_..."
supabase secrets set PAGARME_WEBHOOK_SECRET="..."
supabase secrets set INFINITEPAY_API_KEY="..."
supabase secrets set GOOGLE_CLIENT_ID="..."
supabase secrets set GOOGLE_CLIENT_SECRET="..."
```

### 4. Execute as migrations (ordem obrigatória)

```bash
supabase db push
```

Ou manualmente no SQL Editor do Supabase Dashboard, na ordem:
1. `001_core_tables.sql`
2. `002_payments_system.sql`
3. `003_functions_triggers.sql`
4. `004_storage_rls.sql`

### 5. Deploy das Edge Functions

```bash
# Deploy todas de uma vez
supabase functions deploy ai-chat
supabase functions deploy generate-image
supabase functions deploy logo-generator
supabase functions deploy generate-posts
supabase functions deploy buy-credits
supabase functions deploy upgrade-plan
supabase functions deploy recharge-credits
supabase functions deploy webhook-pagamento
```

Ou todas de uma vez:
```bash
supabase functions deploy --no-verify-jwt recharge-credits webhook-pagamento
supabase functions deploy ai-chat generate-image logo-generator generate-posts buy-credits upgrade-plan
```

---

## Variáveis do Frontend (.env)

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_BILLING_URL=/billing
```

---

## Tabelas principais

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Dados do usuário (plano, avatar) |
| `user_credits` | Saldo e total gasto de créditos |
| `business_profiles` | Questionário estratégico da empresa |
| `business_materials` | Arquivos RAG enviados pelo usuário |
| `generated_images` | Histórico de imagens geradas |
| `generated_logos` | Histórico de logos criados |
| `chat_history` | Histórico de conversas por sessão |
| `generated_posts` | Posts gerados para redes sociais |
| `plans` | Planos disponíveis (free/starter/pro/enterprise) |
| `subscriptions` | Assinaturas ativas por usuário |
| `transactions` | Pagamentos (créditos e assinaturas) |
| `credit_packs` | Packs de créditos avulsos |
| `credit_history` | Auditoria de todas as movimentações de crédito |
| `rate_limits` | Controle de rate limit por endpoint/hora |

---

## Funções SQL (RPC)

| Função | Uso |
|--------|-----|
| `deduct_credits(user_id, amount, reason)` | Deduz créditos com lock e registro |
| `add_credits(user_id, amount, reason)` | Adiciona créditos com registro |
| `check_rate_limit(user_id, endpoint, max)` | Verifica e incrementa rate limit |
| `cleanup_rate_limits()` | Remove entradas antigas (> 48h) |

---

## Custo de créditos por ação

| Ação | Créditos |
|------|----------|
| Mensagem no chat | 1 |
| Imagem padrão (2 variações) | 3 |
| Imagem premium (2 variações) | 6 |
| Mensagem no logo creator | 2 |
| Logo gerado (por imagem) | 4 |
| Geração de posts | 2 |

---

## Webhook Pagar.me

Configure a URL do webhook no painel do Pagar.me:

```
https://SEU_PROJECT_REF.supabase.co/functions/v1/webhook-pagamento
```

Eventos necessários:
- `order.paid`
- `charge.paid`
- `charge.payment_failed`
- `subscription.canceled`

---

## Auth Google OAuth

No Supabase Dashboard > Authentication > Providers > Google:
- Adicione o Client ID e Secret do Google Cloud Console
- URL de redirecionamento: `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`

---

## Storage Buckets

Criados automaticamente via `004_storage_rls.sql`:
- `business-materials` — privado, até 20MB (PDF, DOC, TXT)
- `generated-images` — público, até 10MB (PNG, JPG, WebP)
- `generated-logos` — público, até 10MB (PNG, JPG, WebP, SVG)
- `avatars` — público, até 2MB (PNG, JPG, WebP)
