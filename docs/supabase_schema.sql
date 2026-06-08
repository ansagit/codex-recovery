create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  hostname text not null,
  platform text,
  last_seen_at timestamptz not null default now(),
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(device_id) on delete cascade,
  workspace text,
  backup_file text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  workspace text,
  checkpoint jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;
alter table public.backups enable row level security;
alter table public.checkpoints enable row level security;

create index if not exists backups_device_created_idx
  on public.backups (device_id, created_at desc);

create index if not exists checkpoints_device_created_idx
  on public.checkpoints (device_id, created_at desc);
