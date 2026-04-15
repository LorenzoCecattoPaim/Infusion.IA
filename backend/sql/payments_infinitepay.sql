create table if not exists webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table if exists payment_orders
  add column if not exists transaction_nsu text,
  add column if not exists gateway_status text,
  add column if not exists paid_amount_cents integer,
  add column if not exists capture_method text,
  add column if not exists last_webhook_payload jsonb,
  add column if not exists last_webhook_received_at timestamptz;

create unique index if not exists payment_orders_transaction_nsu_key
  on payment_orders (transaction_nsu)
  where transaction_nsu is not null;

create index if not exists payment_orders_gateway_order_id_idx
  on payment_orders (gateway, gateway_order_id);

create index if not exists payment_orders_user_status_idx
  on payment_orders (user_id, status);
