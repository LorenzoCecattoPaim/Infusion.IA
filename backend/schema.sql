-- Backend schema (PostgreSQL)
create extension if not exists pgcrypto;
-- Ajuste conforme sua instância do Render/Neon/etc.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table if not exists user_credits (
  user_id uuid primary key references users(id) on delete cascade,
  credits integer not null default 0,
  plan text default 'free',
  updated_at timestamptz default now()
);

create table if not exists business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete cascade,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists business_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists generated_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  canal text,
  objetivo text,
  tipo_conteudo text,
  texto_pronto text,
  cta text,
  sugestao_visual text,
  payload_json jsonb,
  created_at timestamptz default now()
);

create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  url text not null,
  prompt text,
  optimized_prompt text,
  negative_prompt text,
  quality text,
  created_at timestamptz default now()
);

create table if not exists generated_logos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  url text not null,
  prompt text,
  description text,
  variation_type text,
  created_at timestamptz default now()
);

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references chat_conversations(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text,
  content text,
  created_at timestamptz default now()
);
