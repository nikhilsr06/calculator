-- 001_init.sql
-- Engineering Formula Calculator System - initial schema
-- Matches the data model in the technical spec section 7.

create extension if not exists pgcrypto;

-- ============================================================
-- users
-- ============================================================
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  role          text not null check (role in ('employee', 'administrator')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- calculators
-- ============================================================
create table if not exists calculators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  active      boolean not null default true,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- formula_versions
-- Only one version per calculator may be active at a time
-- (enforced in application logic + partial unique index below).
-- ============================================================
create table if not exists formula_versions (
  id              uuid primary key default gen_random_uuid(),
  calculator_id   uuid not null references calculators(id) on delete cascade,
  expression      text not null,
  version_number  integer not null,
  active          boolean not null default false,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (calculator_id, version_number)
);

-- Enforce only one active formula version per calculator
create unique index if not exists one_active_version_per_calculator
  on formula_versions (calculator_id)
  where active = true;

-- ============================================================
-- formula_inputs
-- ============================================================
create table if not exists formula_inputs (
  id            uuid primary key default gen_random_uuid(),
  calculator_id uuid not null references calculators(id) on delete cascade,
  name          text not null,        -- variable name used inside the expression
  label         text not null,        -- human readable label shown to employees
  type          text not null default 'number' check (type in ('number', 'text')),
  required      boolean not null default true,
  display_order integer not null default 0,
  unique (calculator_id, name)
);

-- ============================================================
-- calculation_logs
-- ============================================================
create table if not exists calculation_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  calculator_id uuid not null references calculators(id),
  inputs        jsonb not null,
  result        numeric,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- audit_logs
-- ============================================================
create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references users(id),
  action        text not null check (action in (
                  'CREATE_CALCULATOR', 'UPDATE_CALCULATOR', 'DELETE_CALCULATOR',
                  'CREATE_FORMULA', 'UPDATE_FORMULA', 'DELETE_FORMULA',
                  'PUBLISH_FORMULA', 'DISABLE_FORMULA'
                )),
  resource_type text not null,
  resource_id   uuid,
  timestamp     timestamptz not null default now()
);

create index if not exists idx_calc_logs_user on calculation_logs(user_id);
create index if not exists idx_calc_logs_calculator on calculation_logs(calculator_id);
create index if not exists idx_audit_logs_admin on audit_logs(admin_id);
create index if not exists idx_formula_versions_calculator on formula_versions(calculator_id);
create index if not exists idx_formula_inputs_calculator on formula_inputs(calculator_id);
