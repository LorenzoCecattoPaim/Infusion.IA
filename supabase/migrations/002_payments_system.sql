-- ============================================================
-- INFUSION.IA — MIGRATION 002: SISTEMA DE PAGAMENTOS
-- ============================================================

-- ── PLANOS DISPONÍVEIS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  price_brl     NUMERIC(10,2) NOT NULL,
  credits_month INTEGER NOT NULL,
  features      JSONB DEFAULT '[]',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insere planos padrão
INSERT INTO public.plans (slug, name, description, price_brl, credits_month, features) VALUES
  ('free',       'Gratuito',    'Para começar a explorar',           0.00,   30,  '["30 créditos/mês","Chat IA básico","Gerador de imagens"]'),
  ('starter',    'Starter',     'Para pequenos negócios',           49.90,  200, '["200 créditos/mês","Chat IA ilimitado","Gerador de imagens HD","Logo creator","Suporte por email"]'),
  ('pro',        'Pro',         'Para negócios em crescimento',     99.90,  600, '["600 créditos/mês","Todos os recursos Starter","Posts multi-canal","RAG com documentos","Suporte prioritário"]'),
  ('enterprise', 'Enterprise',  'Para grandes operações',          299.90, 9999, '["Créditos ilimitados","API access","Onboarding dedicado","SLA garantido","Suporte 24/7"]')
ON CONFLICT (slug) DO NOTHING;

-- ── ASSINATURAS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id             UUID NOT NULL REFERENCES public.plans(id),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','past_due','trialing','incomplete')),
  gateway             TEXT NOT NULL DEFAULT 'pagarme' CHECK (gateway IN ('pagarme','infinitepay','manual')),
  gateway_customer_id TEXT,
  gateway_sub_id      TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- ── TRANSAÇÕES / PAGAMENTOS ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES public.subscriptions(id),
  type                TEXT NOT NULL CHECK (type IN ('subscription','credit_pack','refund')),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','chargeback')),
  amount_brl          NUMERIC(10,2) NOT NULL,
  credits_granted     INTEGER NOT NULL DEFAULT 0,
  gateway             TEXT NOT NULL,
  gateway_tx_id       TEXT,
  gateway_payload     JSONB,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_gateway_tx_id ON public.transactions(gateway_tx_id);

-- ── PACOTES DE CRÉDITOS AVULSOS ───────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_packs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  credits     INTEGER NOT NULL,
  price_brl   NUMERIC(10,2) NOT NULL,
  bonus_pct   INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.credit_packs (name, credits, price_brl, bonus_pct) VALUES
  ('Pack 100',  100,   9.90, 0),
  ('Pack 300',  330,  24.90, 10),
  ('Pack 600',  720,  44.90, 20),
  ('Pack 1500', 2000, 99.90, 33)
ON CONFLICT DO NOTHING;

-- ── HISTÓRICO DE CRÉDITOS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('purchase','subscription_renewal','manual_grant','chat','generate_image','generate_logo','generate_post','refund')),
  reference_id UUID,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_history_select_own" ON public.credit_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_credit_history_user_id ON public.credit_history(user_id);
CREATE INDEX idx_credit_history_created_at ON public.credit_history(created_at DESC);
