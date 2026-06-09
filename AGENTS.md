# Codex Recovery WSL CLI 规则

这个目录是共享 GitHub 项目 `ansagit/codex-recovery` 的 Ubuntu WSL CLI 部署目录。

Windows CLI 和 WSL CLI 不共用本地工作目录：

- Windows CLI 本地目录：`D:\Codex\Windows\workspace\codex-recovery`
- WSL CLI 本地目录：`/mnt/d/Codex/WSL/workspace/codex-recovery`

两者可以共用同一个 GitHub 项目和同一个 Supabase 项目，但必须通过以下字段隔离：

| 字段 | Windows CLI | WSL CLI |
| --- | --- | --- |
| `profile` | `windows-cli` | `wsl-cli` |
| `cli` | `windows-cli` | `wsl-cli` |
| `device_id` | `hostname + "-windows-cli"` | `hostname + "-wsl-cli"` |
| `workspace` | `D:\Codex\Windows\workspace` | `/mnt/d/Codex/WSL/workspace` |

所有上传到 Supabase 的 `devices`、`backups`、`checkpoints` 记录，都必须包含 `profile`、`cli`、`device_id`、`workspace`。

不要只用 `hostname` 作为 `device_id`。

WSL 实现规则：

- Linux 命令检测使用 `command -v`。
- Python 检测使用 `python3`，不要要求 `python` 必须存在。
- 默认不上传完整 shell 配置文件。
- 默认不上传 Codex `auth.json`、`history.jsonl`、`sessions/`、`logs_*.sqlite`、`state_*.sqlite`、`goals_*.sqlite`、`memories_*.sqlite`。
- `config.toml` 可以记录，但必须脱敏。
- `install-wsl.sh` 可以检查、安装/注册命令、生成恢复计划，但不能静默覆盖用户配置。
- WSL 专用 CLI 实现在 `src/cli-wsl.js`，不要覆盖 Windows 主入口 `src/cli.js`。
