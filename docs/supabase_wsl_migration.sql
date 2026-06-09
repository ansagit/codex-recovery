alter table if exists public.devices add column if not exists profile text;
alter table if exists public.devices add column if not exists cli text;
alter table if exists public.devices add column if not exists workspace text;

alter table if exists public.backups add column if not exists profile text;
alter table if exists public.backups add column if not exists cli text;

alter table if exists public.checkpoints add column if not exists profile text;
alter table if exists public.checkpoints add column if not exists cli text;

create index if not exists devices_profile_cli_idx
  on public.devices (profile, cli, last_seen_at desc);

create index if not exists backups_profile_cli_idx
  on public.backups (profile, cli, created_at desc);

create index if not exists checkpoints_profile_cli_idx
  on public.checkpoints (profile, cli, created_at desc);
