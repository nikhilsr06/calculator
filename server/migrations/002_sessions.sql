-- 002_sessions.sql
-- Enforces a single active session per user, so shared logins get kicked
-- out when someone else logs in with the same credentials.

create table if not exists sessions (
  user_id     uuid primary key references users(id) on delete cascade,
  session_id  uuid not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
