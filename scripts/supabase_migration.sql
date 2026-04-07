-- Supabase migration: create required tables if they do not exist
-- Run in Supabase SQL editor (public schema)

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0,
  plan text default 'free',
  updated_at timestamptz default now()
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  nome_empresa text,
  segmento_atuacao text,
  objetivo_principal text,
  publico_alvo text,
  tom_comunicacao text,
  marca_descricao text,
  canais_atuacao text[] default '{}',
  tipo_conteudo text[] default '{}',
  nivel_experiencia text,
  maior_desafio text,
  uso_ia text,
  contexto_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.business_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.generated_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  canal text,
  objetivo text,
  tipo_conteudo text,
  texto_pronto text,
  cta text,
  sugestao_visual text,
  payload_json jsonb,
  created_at timestamptz default now()
);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  url text not null,
  prompt text,
  optimized_prompt text,
  negative_prompt text,
  quality text,
  created_at timestamptz default now()
);

create table if not exists public.generated_logos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  url text not null,
  prompt text,
  description text,
  variation_type text,
  created_at timestamptz default now()
);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text,
  content text,
  created_at timestamptz default now()
);

-- Optional: default credits for new users
create or replace function public.handle_new_user_credits()
returns trigger as $$
begin
  insert into public.user_credits (user_id, credits, plan)
  values (new.id, 10, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- If the trigger already exists, this will replace it safely
create or replace trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_credits();
