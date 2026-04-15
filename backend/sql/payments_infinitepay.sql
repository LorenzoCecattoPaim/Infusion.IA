create table if not exists webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway text not null default 'infinitepay',
  status text not null default 'pending',
  credits integer not null,
  amount_cents integer not null,
  gateway_order_id text,
  invoice_slug text,
  gateway_payment_url text,
  transaction_nsu text,
  gateway_status text,
  paid_amount_cents integer,
  capture_method text,
  last_webhook_payload jsonb,
  last_webhook_received_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists payment_orders
  add column if not exists transaction_nsu text,
  add column if not exists invoice_slug text,
  add column if not exists gateway_status text,
  add column if not exists paid_amount_cents integer,
  add column if not exists capture_method text,
  add column if not exists last_webhook_payload jsonb,
  add column if not exists last_webhook_received_at timestamptz,
  add column if not exists credited_at timestamptz;

create table if not exists payment_credit_ledger (
  order_id uuid primary key references payment_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists payment_orders_transaction_nsu_key
  on payment_orders (transaction_nsu)
  where transaction_nsu is not null;

create index if not exists payment_orders_gateway_order_id_idx
  on payment_orders (gateway, gateway_order_id);

create index if not exists payment_orders_invoice_slug_idx
  on payment_orders (gateway, invoice_slug);

create index if not exists payment_orders_user_status_idx
  on payment_orders (user_id, status);

create index if not exists payment_credit_ledger_user_id_idx
  on payment_credit_ledger (user_id, created_at desc);

create or replace function apply_payment_credits(
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
