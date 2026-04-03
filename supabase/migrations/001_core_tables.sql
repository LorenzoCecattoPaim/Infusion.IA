-- ============================================================
-- INFUSION.IA — MIGRATION 001: CORE TABLES
-- ============================================================

-- Habilita extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── PROFILES ──────────────────────────────────────────────
-- Criado automaticamente ao registrar via Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  avatar_url    TEXT,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── USER CREDITS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_credits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  credits       INTEGER NOT NULL DEFAULT 30 CHECK (credits >= 0),
  total_used    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits_select_own" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "credits_update_own" ON public.user_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- ── BUSINESS PROFILES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome_empresa     TEXT,
  segmento         TEXT,
  porte            TEXT CHECK (porte IN ('MEI', 'Pequena', 'Média', 'Grande', 'Startup')),
  publico_alvo     TEXT,
  diferenciais     TEXT,
  desafios         TEXT,
  tom_de_voz       TEXT,
  redes_sociais    JSONB DEFAULT '[]',
  concorrentes     TEXT,
  objetivos        TEXT,
  faturamento_faixa TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_profiles_all_own" ON public.business_profiles
  FOR ALL USING (auth.uid() = user_id);

-- ── BUSINESS MATERIALS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_materials (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  content     TEXT,
  file_url    TEXT,
  file_type   TEXT,
  size_bytes  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.business_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_all_own" ON public.business_materials
  FOR ALL USING (auth.uid() = user_id);

-- ── GENERATED IMAGES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_images (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  prompt           TEXT NOT NULL,
  optimized_prompt TEXT,
  negative_prompt  TEXT,
  quality          TEXT NOT NULL DEFAULT 'standard' CHECK (quality IN ('standard', 'premium')),
  template         TEXT,
  credits_used     INTEGER NOT NULL DEFAULT 3,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "images_all_own" ON public.generated_images
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_generated_images_user_id ON public.generated_images(user_id);
CREATE INDEX idx_generated_images_created_at ON public.generated_images(created_at DESC);

-- ── GENERATED LOGOS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_logos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  description TEXT,
  brand_name  TEXT,
  style       TEXT,
  colors      TEXT,
  variation   TEXT,
  selected    BOOLEAN DEFAULT FALSE,
  credits_used INTEGER NOT NULL DEFAULT 2,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.generated_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logos_all_own" ON public.generated_logos
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_generated_logos_user_id ON public.generated_logos(user_id);

-- ── CHAT HISTORY ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL DEFAULT uuid_generate_v4(),
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_all_own" ON public.chat_history
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_chat_history_user_session ON public.chat_history(user_id, session_id);
CREATE INDEX idx_chat_history_created_at ON public.chat_history(created_at DESC);

-- ── GENERATED POSTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief        TEXT NOT NULL,
  canal        TEXT NOT NULL,
  titulo       TEXT,
  caption      TEXT NOT NULL,
  hashtags     TEXT[],
  cta          TEXT,
  sugestao_visual TEXT,
  melhor_horario  TEXT,
  dicas_extras TEXT,
  credits_used INTEGER NOT NULL DEFAULT 2,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_all_own" ON public.generated_posts
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_generated_posts_user_id ON public.generated_posts(user_id);
