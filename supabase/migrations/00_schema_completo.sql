-- ============================================================
-- INFUSION.IA — SCHEMA COMPLETO
-- Execute este arquivo no Supabase SQL Editor
-- ============================================================

-- ─── EXTENSÕES ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TABELA: user_credits ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_credits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits     INTEGER NOT NULL DEFAULT 30,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

COMMENT ON TABLE public.user_credits IS 'Saldo de créditos e plano de cada usuário';
COMMENT ON COLUMN public.user_credits.credits IS 'Créditos disponíveis para uso';
COMMENT ON COLUMN public.user_credits.plan IS 'Plano atual: free | starter | pro | business';

-- ─── TABELA: business_profiles ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_empresa         TEXT,
  segmento             TEXT,
  porte                TEXT,
  publico_alvo         TEXT,
  diferenciais         TEXT,
  desafios             TEXT,
  tom_comunicacao      TEXT,
  concorrentes         TEXT,
  objetivos_marketing  TEXT,
  redes_sociais        TEXT[],
  orcamento_mensal     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

COMMENT ON TABLE public.business_profiles IS 'Perfil do negócio para personalização da IA';

-- ─── TABELA: business_materials ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_materials (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  file_size   INTEGER,
  mime_type   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.business_materials IS 'Materiais enviados pelo usuário para contexto da IA (RAG)';
CREATE INDEX IF NOT EXISTS idx_business_materials_user ON public.business_materials(user_id);

-- ─── TABELA: generated_images ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_images (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  prompt            TEXT NOT NULL,
  optimized_prompt  TEXT,
  negative_prompt   TEXT,
  quality           TEXT NOT NULL DEFAULT 'standard',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.generated_images IS 'Histórico de imagens geradas por usuário';
CREATE INDEX IF NOT EXISTS idx_generated_images_user ON public.generated_images(user_id, created_at DESC);

-- ─── TABELA: payment_orders ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits              INTEGER NOT NULL,
  amount_cents         INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  gateway              TEXT NOT NULL DEFAULT 'pagarme',
  gateway_order_id     TEXT,
  gateway_payment_url  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_orders IS 'Pedidos de compra de créditos';
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON public.payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_gateway ON public.payment_orders(gateway_order_id);

-- ─── TABELA: rate_limits ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, action)
);

COMMENT ON TABLE public.rate_limits IS 'Rate limiting por usuário e ação';

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- user_credits: usuário vê e edita apenas seus próprios dados
CREATE POLICY "user_credits_select" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_credits_update" ON public.user_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- business_profiles: CRUD apenas do próprio perfil
CREATE POLICY "business_profiles_select" ON public.business_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "business_profiles_insert" ON public.business_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "business_profiles_update" ON public.business_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "business_profiles_delete" ON public.business_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- business_materials: CRUD apenas dos próprios materiais
CREATE POLICY "business_materials_select" ON public.business_materials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "business_materials_insert" ON public.business_materials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "business_materials_delete" ON public.business_materials
  FOR DELETE USING (auth.uid() = user_id);

-- generated_images: apenas do próprio usuário
CREATE POLICY "generated_images_select" ON public.generated_images
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "generated_images_insert" ON public.generated_images
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- payment_orders: apenas do próprio usuário (sem edição direta)
CREATE POLICY "payment_orders_select" ON public.payment_orders
  FOR SELECT USING (auth.uid() = user_id);

-- ─── FUNÇÃO: auto-criar user_credits no signup ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits, plan)
  VALUES (NEW.id, 30, 'free')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.business_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: dispara após novo usuário criado no auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── FUNÇÃO: updated_at automático ───────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── FUNÇÃO: consumir créditos (transação atômica) ───────────
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current INTEGER;
BEGIN
  SELECT credits INTO v_current
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL OR v_current < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_credits
  SET credits = credits - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;

-- ─── FUNÇÃO: adicionar créditos (após pagamento) ─────────────
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  UPDATE public.user_credits
  SET credits = credits + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, credits)
    VALUES (p_user_id, p_amount)
    RETURNING credits INTO v_new_credits;
  END IF;

  RETURN v_new_credits;
END;
$$;

-- ─── VIEW: resumo do usuário (stats do dashboard) ────────────
CREATE OR REPLACE VIEW public.user_summary AS
SELECT
  uc.user_id,
  uc.credits,
  uc.plan,
  (SELECT COUNT(*) FROM public.generated_images gi WHERE gi.user_id = uc.user_id) AS images_generated,
  (SELECT COUNT(*) FROM public.business_materials bm WHERE bm.user_id = uc.user_id) AS materials_count,
  bp.nome_empresa,
  bp.segmento
FROM public.user_credits uc
LEFT JOIN public.business_profiles bp ON bp.user_id = uc.user_id;

-- Permitir que usuário veja apenas seu próprio resumo
CREATE POLICY "user_summary_select" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- ─── DADOS INICIAIS: usuários existentes ─────────────────────
-- Garante que usuários já criados antes do trigger também tenham créditos
INSERT INTO public.user_credits (user_id, credits, plan)
SELECT id, 30, 'free'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.business_profiles (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ─── GRANT: service role pode operar todas as tabelas ────────
GRANT ALL ON public.user_credits TO service_role;
GRANT ALL ON public.business_profiles TO service_role;
GRANT ALL ON public.business_materials TO service_role;
GRANT ALL ON public.generated_images TO service_role;
GRANT ALL ON public.payment_orders TO service_role;
GRANT ALL ON public.rate_limits TO service_role;

-- ─── FIM DO SCHEMA ────────────────────────────────────────────
-- Verifique em: Supabase Dashboard > Table Editor
