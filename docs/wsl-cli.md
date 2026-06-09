# WSL CLI Guide

This guide covers the Ubuntu WSL deployment of `ansagit/codex-recovery`.

## Local Directory Separation

Windows CLI and WSL CLI must stay separate locally:

```text
Windows: D:\Codex\Windows\workspace\codex-recovery
WSL:     /mnt/d/Codex/WSL/workspace/codex-recovery
```

They share:

- GitHub project: `ansagit/codex-recovery`
- Supabase project: the same `devices`, `backups`, and `checkpoints` tables

They do not share:

- Local working directory
- Runtime `.codex-recovery/` directory
- Shell profile registration

## Supabase Isolation Fields

All uploaded records must include these fields:

| Field | Windows CLI | WSL CLI |
| --- | --- | --- |
| `profile` | `windows-cli` | `wsl-cli` |
| `cli` | `windows-cli` | `wsl-cli` |
| `device_id` | `hostname + "-windows-cli"` | `hostname + "-wsl-cli"` |
| `workspace` | `D:\Codex\Windows\workspace` | `/mnt/d/Codex/WSL/workspace` |

Do not use hostname alone as `device_id`.

## Three Commands

Daily start:

```bash
cd /mnt/d/Codex/WSL/workspace; codex
```

Resume:

```bash
cd /mnt/d/Codex/WSL/workspace; codex-recovery resume
```

Reinstall or new WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/ansagit/codex-recovery/main/install-wsl.sh -o install-wsl.sh
bash install-wsl.sh
```

## WSL Collection Rules

- Use `command -v` for command detection.
- Use `python3 --version`; `python` is optional and not required.
- Record shell config existence and short redacted summaries only.
- Do not upload full `~/.bashrc`, `~/.profile`, or `~/.zshrc`.
- Do not upload Codex `auth.json`, `history.jsonl`, `sessions/`, `logs_*.sqlite`, `state_*.sqlite`, `goals_*.sqlite`, or `memories_*.sqlite`.
- `~/.codex/config.toml` may be captured only after redaction.

## Install Script Boundary

`install-wsl.sh` may:

1. Check Git, Node.js, npm, python3, Codex CLI, and optional tools.
2. Register `codex-recovery` for the current shell.
3. Generate a restore plan.

It must not silently overwrite user configuration.

## Supabase Setup

Configure WSL Supabase credentials locally:

```bash
bash /mnt/d/Codex/WSL/workspace/codex-recovery/scripts/configure-supabase.sh
```

The script writes only:

```text
~/.codex-recovery/supabase.json
```

Do not commit this file.

If the shared Supabase project was created by the Windows CLI first, run this migration once in Supabase SQL Editor before WSL uploads:

```text
docs/supabase_wsl_migration.sql
```
