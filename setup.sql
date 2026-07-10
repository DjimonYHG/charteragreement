-- ============================================================================
-- Yachthub Charter Paperwork System - Supabase schema
-- ============================================================================
-- Run this once in the Supabase SQL editor for a new project. It creates:
--   charters      - one row per charter, stores the full form payload as JSONB
--   charter_logs  - append-only audit log of every save
--
-- ============================================================================

-- Extension for gen_random_uuid
create extension if not exists "pgcrypto";

-- =============================================================
-- Table: charters
-- =============================================================
create table if not exists public.charters (
  id              uuid primary key default gen_random_uuid(),
  charter_ref     text unique not null,
  status          text not null default 'draft' check (status in ('draft', 'confirmed', 'sent', 'signed', 'cancelled')),
  payload         jsonb not null default '{}'::jsonb,
  agent_user_id   uuid references auth.users(id) on delete set null,
  charterer_name  text generated always as (payload->'charterer'->>'full_name') stored,
  vessel_name     text generated always as (payload->'vessel'->>'name') stored,
  from_date       text generated always as (payload->'charter'->>'from_date') stored,
  to_date         text generated always as (payload->'charter'->>'to_date') stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.charters is 'One row per charter. Full form payload stored as JSONB in `payload`.';
comment on column public.charters.charter_ref is 'Human-readable reference like YHG-2026-0042. Auto-generated on insert.';
comment on column public.charters.status is 'draft = agent still editing; confirmed = ready to send; sent = with Docusign; signed = fully executed; cancelled = void';

-- Trigger to update updated_at on every change
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_charters_touch on public.charters;
create trigger trg_charters_touch
  before update on public.charters
  for each row execute function public.tg_touch_updated_at();

-- Auto-generate charter_ref on insert if not supplied
create or replace function public.tg_generate_charter_ref()
returns trigger language plpgsql as $$
declare
  year_part text;
  seq_num int;
begin
  if new.charter_ref is null or new.charter_ref = '' then
    year_part := to_char(now(), 'YYYY');
    select coalesce(max(cast(substring(charter_ref from 'YHG-' || year_part || '-(\d+)') as int)), 0) + 1
      into seq_num
      from public.charters
      where charter_ref like 'YHG-' || year_part || '-%';
    new.charter_ref := 'YHG-' || year_part || '-' || lpad(seq_num::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_charters_ref on public.charters;
create trigger trg_charters_ref
  before insert on public.charters
  for each row execute function public.tg_generate_charter_ref();

-- =============================================================
-- Table: charter_logs (audit trail of every save)
-- =============================================================
create table if not exists public.charter_logs (
  id           uuid primary key default gen_random_uuid(),
  charter_id   uuid not null references public.charters(id) on delete cascade,
  agent_user_id uuid references auth.users(id) on delete set null,
  action       text not null check (action in ('save', 'submit', 'send', 'sign', 'cancel')),
  payload_snapshot jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_charter_logs_charter_id on public.charter_logs(charter_id, created_at desc);

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.charters enable row level security;
alter table public.charter_logs enable row level security;

-- Agents can select and update charters they created; can insert new ones
drop policy if exists charters_select_own on public.charters;
create policy charters_select_own
  on public.charters for select
  to authenticated
  using (agent_user_id = auth.uid());

drop policy if exists charters_insert_own on public.charters;
create policy charters_insert_own
  on public.charters for insert
  to authenticated
  with check (agent_user_id = auth.uid());

drop policy if exists charters_update_own on public.charters;
create policy charters_update_own
  on public.charters for update
  to authenticated
  using (agent_user_id = auth.uid())
  with check (agent_user_id = auth.uid());

-- Logs are agent-visible for their own charters
drop policy if exists logs_select_own on public.charter_logs;
create policy logs_select_own
  on public.charter_logs for select
  to authenticated
  using (agent_user_id = auth.uid());

drop policy if exists logs_insert_own on public.charter_logs;
create policy logs_insert_own
  on public.charter_logs for insert
  to authenticated
  with check (agent_user_id = auth.uid());

-- =============================================================
-- Convenience view for the agent dashboard
-- =============================================================
create or replace view public.charter_dashboard as
select
  c.id,
  c.charter_ref,
  c.status,
  c.charterer_name,
  c.vessel_name,
  c.from_date,
  c.to_date,
  c.created_at,
  c.updated_at,
  c.agent_user_id
from public.charters c
order by c.updated_at desc;

grant select on public.charter_dashboard to authenticated;
