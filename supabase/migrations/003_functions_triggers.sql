-- ============================================================
-- INFUSION.IA — MIGRATION 003: FUNÇÕES, TRIGGERS E RATE LIMITS
-- ============================================================

-- ── FUNÇÃO: auto-create profile + credits ao criar usuário ─
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Cria profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Cria créditos iniciais (30 para plano free)
  INSERT INTO public.user_credits (user_id, credits, total_used)
  VALUES (NEW.id, 30, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Cria perfil de negócio vazio
  INSERT INTO public.business_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Registra no histórico
  INSERT INTO public.credit_history (user_id, delta, balance_after, reason, description)
  VALUES (NEW.id, 30, 30, 'manual_grant', 'Bônus de boas-vindas — plano gratuito');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── FUNÇÃO: updated_at automático ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_business_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── FUNÇÃO: deduzir créditos com registro no histórico ─────
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id   UUID,
  p_amount    INTEGER,
  p_reason    TEXT,
  p_ref_id    UUID DEFAULT NULL,
  p_desc      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current  INTEGER;
  v_after    INTEGER;
BEGIN
  -- Bloqueia a linha para concorrência segura
  SELECT credits INTO v_current
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'current', v_current);
  END IF;

  v_after := v_current - p_amount;

  UPDATE public.user_credits
  SET credits = v_after, total_used = total_used + p_amount
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_history (user_id, delta, balance_after, reason, reference_id, description)
  VALUES (p_user_id, -p_amount, v_after, p_reason, p_ref_id, p_desc);

  RETURN jsonb_build_object('ok', true, 'credits_before', v_current, 'credits_after', v_after);
END;
$$;

-- ── FUNÇÃO: adicionar créditos ─────────────────────────────
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id   UUID,
  p_amount    INTEGER,
  p_reason    TEXT,
  p_ref_id    UUID DEFAULT NULL,
  p_desc      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current  INTEGER;
  v_after    INTEGER;
BEGIN
  SELECT credits INTO v_current
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    INSERT INTO public.user_credits (user_id, credits) VALUES (p_user_id, p_amount);
    v_after := p_amount;
  ELSE
    v_after := v_current + p_amount;
    UPDATE public.user_credits SET credits = v_after WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.credit_history (user_id, delta, balance_after, reason, reference_id, description)
  VALUES (p_user_id, p_amount, v_after, p_reason, p_ref_id, p_desc);

  RETURN jsonb_build_object('ok', true, 'credits_before', COALESCE(v_current, 0), 'credits_after', v_after);
END;
$$;

-- ── RATE LIMITS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('hour', NOW()),
  request_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, endpoint, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_own" ON public.rate_limits
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_rate_limits_user_endpoint ON public.rate_limits(user_id, endpoint, window_start);

-- ── FUNÇÃO: verificar e incrementar rate limit ─────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id  UUID,
  p_endpoint TEXT,
  p_max      INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window TIMESTAMPTZ := DATE_TRUNC('hour', NOW());
  v_count  INTEGER;
BEGIN
  INSERT INTO public.rate_limits (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, v_window, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  IF v_count > p_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit_exceeded', 'count', v_count, 'max', p_max);
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'max', p_max);
END;
$$;

-- ── CLEANUP: remove rate limits antigos (> 48h) ───────────
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '48 hours';
END;
$$;

-- ── VIEW: stats do usuário ─────────────────────────────────
CREATE OR REPLACE VIEW public.user_stats AS
SELECT
  u.id AS user_id,
  uc.credits,
  uc.total_used,
  (SELECT COUNT(*) FROM public.generated_images gi WHERE gi.user_id = u.id) AS images_count,
  (SELECT COUNT(*) FROM public.generated_logos gl WHERE gl.user_id = u.id) AS logos_count,
  (SELECT COUNT(*) FROM public.generated_posts gp WHERE gp.user_id = u.id) AS posts_count,
  (SELECT COUNT(*) FROM public.chat_history ch WHERE ch.user_id = u.id AND ch.role = 'user') AS chat_messages_count,
  p.plan,
  bp.nome_empresa,
  bp.segmento
FROM auth.users u
LEFT JOIN public.user_credits uc ON uc.user_id = u.id
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.business_profiles bp ON bp.user_id = u.id;

-- Segurança: apenas o próprio usuário vê seus dados
CREATE OR REPLACE FUNCTION public.user_stats_security(user_stats)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT $1.user_id = auth.uid() $$;

ALTER VIEW public.user_stats SET (security_invoker = true);
