-- Creates the plans table used by the backend syncPlanCatalog
create table if not exists public.plans (
  id text primary key,
  name text not null,
  billing_cycle text not null,
  price numeric not null,
  old_price numeric,
  credits integer,
  benefit text,
  is_popular boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

