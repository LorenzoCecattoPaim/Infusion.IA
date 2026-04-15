-- Supabase migration: create required tables if they do not exist
-- Run in Supabase SQL editor (public schema)

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 100,
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

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway text not null default 'infinitepay',
  status text not null default 'pending',
  credits integer not null,
  amount_cents integer not null,
  gateway_order_id text,
  gateway_payment_url text,
  transaction_nsu text,
  gateway_status text,
  paid_amount_cents integer,
  capture_method text,
  last_webhook_payload jsonb,
  last_webhook_received_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.webhook_events (
  id text primary key,
  created_at timestamptz default now()
);

create table if not exists public.payment_credit_ledger (
  order_id uuid primary key references public.payment_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz default now()
);

create unique index if not exists payment_orders_transaction_nsu_key
  on public.payment_orders (transaction_nsu)
  where transaction_nsu is not null;

create index if not exists payment_orders_gateway_order_id_idx
  on public.payment_orders (gateway, gateway_order_id);

create index if not exists payment_orders_user_status_idx
  on public.payment_orders (user_id, status);

create index if not exists payment_credit_ledger_user_id_idx
  on public.payment_credit_ledger (user_id, created_at desc);

create or replace function public.apply_payment_credits(
  p_order_id uuid,
  p_user_id uuid,
  p_amount integer
)
returns table (applied boolean, credits integer)
language plpgsql
security definer
as $$
declare
  v_inserted integer := 0;
  v_credits integer := 0;
begin
  if p_order_id is null or p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'Parâmetros inválidos para aplicar créditos';
  end if;

  insert into public.payment_credit_ledger (order_id, user_id, amount)
  values (p_order_id, p_user_id, p_amount)
  on conflict (order_id) do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.user_credits (user_id, credits, plan)
  values (p_user_id, 100, 'free')
  on conflict (user_id) do nothing;

  if v_inserted > 0 then
    update public.user_credits
       set credits = credits + p_amount,
           updated_at = now()
     where user_id = p_user_id
     returning public.user_credits.credits into v_credits;

    update public.payment_orders
       set credited_at = now(),
           updated_at = now()
     where id = p_order_id;

    return query select true, v_credits;
  end if;

  select uc.credits
    into v_credits
    from public.user_credits uc
   where uc.user_id = p_user_id;

  return query select false, coalesce(v_credits, 0);
end;
$$;

-- Optional: default credits for new users
create or replace function public.handle_new_user_credits()
returns trigger as $$
begin
  insert into public.user_credits (user_id, credits, plan)
  values (new.id, 100, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- If the trigger already exists, this will replace it safely
create or replace trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_credits();
