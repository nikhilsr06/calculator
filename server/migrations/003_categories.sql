-- 003_categories.sql
-- Adds calculator categories (admin-managed, reorderable) plus per-calculator
-- ordering and a display unit for the calculated result.

create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table calculators
  add column if not exists category_id   uuid references categories(id) on delete set null,
  add column if not exists display_order integer not null default 0,
  add column if not exists result_unit   text;

create index if not exists idx_calculators_category on calculators(category_id);
create index if not exists idx_categories_display_order on categories(display_order);

-- Widen the audit log action whitelist to cover category management.
alter table audit_logs drop constraint if exists audit_logs_action_check;
alter table audit_logs add constraint audit_logs_action_check check (action in (
  'CREATE_CALCULATOR', 'UPDATE_CALCULATOR', 'DELETE_CALCULATOR',
  'CREATE_FORMULA', 'UPDATE_FORMULA', 'DELETE_FORMULA',
  'PUBLISH_FORMULA', 'DISABLE_FORMULA',
  'CREATE_CATEGORY', 'UPDATE_CATEGORY', 'DELETE_CATEGORY',
  'REORDER_CATEGORIES', 'REORDER_CALCULATORS'
));
