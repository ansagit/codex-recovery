#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const DATA_DIR = path.join(process.cwd(), ".codex-recovery");
const GLOBAL_DATA_DIR = path.join(os.homedir(), ".codex-recovery");
const SUPABASE_CONFIG_FILE = path.join(GLOBAL_DATA_DIR, "supabase.json");
const CHECKPOINT_FILE = path.join(DATA_DIR, "last-checkpoint.json");
const RESUME_FILE = path.join(DATA_DIR, "resume.md");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const command = process.argv[2] || "help";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function run(cmd, options = {}) {
  try {
    return cp.execSync(cmd, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: options.timeout || 15000
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const stdout = error.stdout ? String(error.stdout).trim() : "";
    return stdout || stderr || null;
  }
}

function existsCommand(name) {
  const output = run(`where ${name}`, { timeout: 5000 });
  return Boolean(output && !output.toLowerCase().includes("could not find"));
}

function safeRead(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function redact(text) {
  if (!text) return text;
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(ghp_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(github_pat_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, "[REDACTED_JWT]")
    .replace(/((password|passwd|pwd|token|secret|apikey|api_key)\s*[:=]\s*)([^\s"']+)/gi, "$1[REDACTED]");
}

function gitInfo() {
  const inside = run("git rev-parse --is-inside-work-tree");
  if (inside !== "true") {
    return {
      is_repo: false,
      branch: null,
      head: null,
      dirty: null,
      status: "not a git repository",
      changed_files: []
    };
  }

  const status = run("git status --short") || "";
  return {
    is_repo: true,
    branch: run("git branch --show-current") || null,
    head: run("git rev-parse --short HEAD") || null,
    dirty: status.length > 0,
    status,
    changed_files: status
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
  };
}

function collectSnapshot() {
  const userProfile = os.homedir();
  const appData = process.env.APPDATA || "";
  const psProfile = run("powershell -NoProfile -Command \"$PROFILE\"");
  const codexConfig = path.join(userProfile, ".codex", "config.toml");
  const codeSettings = appData ? path.join(appData, "Code", "User", "settings.json") : null;

  const snapshot = {
    created_at: nowIso(),
    device: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      user: os.userInfo().username
    },
    workspace: process.cwd(),
    tools: {
      powershell: run("powershell -NoProfile -Command \"$PSVersionTable.PSVersion.ToString()\""),
      git: run("git --version"),
      node: run("node --version"),
      npm: run("npm --version"),
      pnpm: run("pnpm --version"),
      python: run("python --version"),
      code: existsCommand("code") ? "installed" : "not found",
      codex: run("codex --version") || (existsCommand("codex") ? "installed" : "not found")
    },
    vscode: {
      extensions: existsCommand("code")
        ? (run("code --list-extensions", { timeout: 20000 }) || "").split(/\r?\n/).filter(Boolean)
        : []
    },
    npm_global_packages: run("npm ls -g --depth=0 --json", { timeout: 30000 }),
    git_config: redact(run("git config --global --list")),
    files: {
      powershell_profile: {
        path: psProfile || null,
        exists: Boolean(psProfile && fs.existsSync(psProfile)),
        content: redact(safeRead(psProfile))
      },
      codex_config: {
        path: codexConfig,
        exists: fs.existsSync(codexConfig),
        content: redact(safeRead(codexConfig))
      },
      vscode_settings: {
        path: codeSettings,
        exists: Boolean(codeSettings && fs.existsSync(codeSettings)),
        content: redact(safeRead(codeSettings))
      }
    },
    git: gitInfo()
  };

  return snapshot;
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readSupabaseConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (envUrl && envKey) {
    return {
      url: envUrl.replace(/\/+$/, ""),
      key: envKey,
      source: "environment"
    };
  }

  const config = readJson(SUPABASE_CONFIG_FILE);
  if (!config || !config.url || !config.key) return null;
  return {
    url: String(config.url).replace(/\/+$/, ""),
    key: String(config.key),
    source: SUPABASE_CONFIG_FILE
  };
}

function supabaseHeaders(config, extra = {}) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabaseRequest(config, table, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${table}${options.query || ""}`, {
    method: options.method || "POST",
    headers: supabaseHeaders(config, options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${table} ${response.status}: ${body}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function currentDeviceId() {
  return os.hostname().toLowerCase();
}

async function uploadBackupToSupabase(snapshot, backupFile) {
  const config = readSupabaseConfig();
  if (!config) {
    return {
      uploaded: false,
      reason: "Supabase is not configured."
    };
  }

  const deviceId = currentDeviceId();
  await supabaseRequest(config, "devices", {
    query: "?on_conflict=device_id",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [
      {
        device_id: deviceId,
        hostname: os.hostname(),
        platform: os.platform(),
        last_seen_at: nowIso(),
        snapshot
      }
    ]
  });

  await supabaseRequest(config, "backups", {
    headers: { Prefer: "return=minimal" },
    body: [
      {
        device_id: deviceId,
        workspace: process.cwd(),
        backup_file: backupFile,
        snapshot
      }
    ]
  });

  const checkpoint = readCheckpoint();
  if (checkpoint) {
    await uploadCheckpointToSupabase(checkpoint, config);
  }

  return {
    uploaded: true,
    source: config.source
  };
}

async function uploadCheckpointToSupabase(checkpoint, existingConfig) {
  const config = existingConfig || readSupabaseConfig();
  if (!config) {
    return {
      uploaded: false,
      reason: "Supabase is not configured."
    };
  }

  await supabaseRequest(config, "checkpoints", {
    headers: { Prefer: "return=minimal" },
    body: [
      {
        device_id: currentDeviceId(),
        workspace: checkpoint.workspace || process.cwd(),
        checkpoint
      }
    ]
  });

  return {
    uploaded: true,
    source: config.source
  };
}

function readCheckpoint() {
  return readJson(CHECKPOINT_FILE);
}

function createAutomaticCheckpoint(fields = {}) {
  const git = gitInfo();
  return {
    device: os.hostname(),
    cli: "windows-cli",
    workspace: process.cwd(),
    task: fields.task || "继续上一次 Codex 工作",
    done: fields.done || "已保存当前工作区状态。",
    todo: fields.todo || "打开恢复说明，确认下一步后继续运行 Codex。",
    last_command: fields.last_command || null,
    status: fields.status || "checkpoint",
    next_step: fields.next_step || "运行 cd D:\\Codex\\Windows\\workspace; codex 继续工作。",
    updated_at: nowIso(),
    git
  };
}

function renderResume(checkpoint) {
  const git = checkpoint.git || {};
  return `# Codex Recovery Resume

更新时间：${checkpoint.updated_at || nowIso()}

## 上次任务

${checkpoint.task || "未记录"}

## 已完成

${checkpoint.done || "未记录"}

## 未完成

${checkpoint.todo || "未记录"}

## 下一步

${checkpoint.next_step || "运行 codex 继续工作。"}

## 工作区

${checkpoint.workspace || process.cwd()}

## Git 状态

- 仓库：${git.is_repo ? "是" : "否"}
- 分支：${git.branch || "无"}
- HEAD：${git.head || "无"}
- 是否有未提交修改：${git.dirty === null ? "未知" : git.dirty ? "是" : "否"}

## 最近变化文件

${(git.changed_files || []).length ? git.changed_files.map((file) => `- ${file}`).join("\n") : "无记录"}
`;
}

function printSimpleCommands() {
  console.log(`
你只需要记住 3 条命令：

平时开始工作：
cd D:\\Codex\\Windows\\workspace; codex

任务中断后恢复：
cd D:\\Codex\\Windows\\workspace; codex-recovery resume

系统重装 / 换电脑恢复：
iwr https://raw.githubusercontent.com/ansagit/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\\install.ps1
`);
}

function cmdSnapshot() {
  ensureDir(SNAPSHOT_DIR);
  const snapshot = collectSnapshot();
  const filePath = path.join(SNAPSHOT_DIR, `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeJson(filePath, snapshot);
  console.log(`环境清单已生成：${filePath}`);
}

async function cmdCheckpoint() {
  const checkpoint = createAutomaticCheckpoint({
    task: process.argv.slice(3).join(" ") || undefined
  });
  writeJson(CHECKPOINT_FILE, checkpoint);
  fs.writeFileSync(RESUME_FILE, renderResume(checkpoint), "utf8");
  console.log(`任务断点已保存：${CHECKPOINT_FILE}`);
  console.log(`恢复说明已生成：${RESUME_FILE}`);

  const upload = await uploadCheckpointToSupabase(checkpoint);
  if (upload.uploaded) {
    console.log("任务断点已上传到 Supabase。");
  } else {
    console.log("Supabase 未配置，任务断点仅保存在本地。");
  }
}

function cmdLast() {
  const checkpoint = readCheckpoint();
  if (!checkpoint) {
    console.log("还没有任务断点。可以先运行 codex-recovery checkpoint 保存一次。");
    return;
  }
  console.log(renderResume(checkpoint));
}

function cmdResume() {
  ensureDir(DATA_DIR);
  let checkpoint = readCheckpoint();
  if (!checkpoint) {
    checkpoint = createAutomaticCheckpoint({
      status: "auto-created",
      done: "没有找到旧断点，工具已根据当前工作区自动生成一个基础断点。",
      todo: "检查当前工作区和 Git 状态，然后继续 Codex。",
      next_step: "确认下方恢复说明后，运行 cd D:\\Codex\\Windows\\workspace; codex。"
    });
    writeJson(CHECKPOINT_FILE, checkpoint);
  }

  const resume = renderResume(checkpoint);
  fs.writeFileSync(RESUME_FILE, resume, "utf8");
  console.log(resume);
  console.log(`恢复说明文件：${RESUME_FILE}`);
  console.log("");
  console.log("继续工作命令：");
  console.log("cd D:\\Codex\\Windows\\workspace; codex");
}

function copyConfigBackup(snapshot, snapshotFile) {
  ensureDir(BACKUP_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `backup-${stamp}.json`);
  snapshot.backup = {
    type: "local",
    supabase_uploaded: false,
    reason: "Supabase credentials are not configured yet."
  };
  if (snapshotFile) snapshot.backup.snapshot_file = snapshotFile;
  writeJson(backupFile, snapshot);
  return backupFile;
}

async function cmdBackup() {
  ensureDir(SNAPSHOT_DIR);
  const snapshot = collectSnapshot();
  const snapshotFile = path.join(SNAPSHOT_DIR, `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeJson(snapshotFile, snapshot);
  const backupFile = copyConfigBackup(snapshot, snapshotFile);

  console.log(`本地环境清单已保存：${snapshotFile}`);
  console.log(`本地备份包已保存：${backupFile}`);

  const upload = await uploadBackupToSupabase(snapshot, backupFile);
  if (upload.uploaded) {
    console.log("备份已上传到 Supabase。");
  } else {
    console.log("Supabase 未配置，本次只保存到本地。");
  }
}

function cmdRestorePlan() {
  const checkpoint = readCheckpoint();
  const plan = `# Codex Recovery Restore Plan

生成时间：${nowIso()}

## 恢复原则

先显示计划，再由用户确认。第一版不会静默安装或覆盖配置。

## 当前机器

- 设备：${os.hostname()}
- 工作区：${process.cwd()}

## 建议步骤

1. 检查 Git、Node.js、VS Code、Codex CLI 是否安装。
2. 恢复 PowerShell、Git、VS Code、Codex 基础配置。
3. 显示最近任务断点。
4. 用户确认后继续 Codex 工作。

## 最近任务断点

${checkpoint ? renderResume(checkpoint) : "暂无本地任务断点。"}
`;
  const planFile = path.join(DATA_DIR, "restore-plan.md");
  ensureDir(DATA_DIR);
  fs.writeFileSync(planFile, plan, "utf8");
  console.log(`恢复计划已生成：${planFile}`);
}

function cmdRestore() {
  console.log("第一版 restore 只生成和显示恢复计划，不会静默安装或覆盖配置。");
  cmdRestorePlan();
}

function removeOldFiles(dir, keepLatest) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const removable = files.slice(keepLatest);
  for (const file of removable) {
    fs.unlinkSync(file);
  }
  return removable.length;
}

function cmdClean() {
  const keepLatest = 5;
  const removedSnapshots = removeOldFiles(SNAPSHOT_DIR, keepLatest);
  const removedBackups = removeOldFiles(BACKUP_DIR, keepLatest);
  console.log(`清理完成。保留最近 ${keepLatest} 个快照和备份。`);
  console.log(`删除快照：${removedSnapshots}`);
  console.log(`删除备份：${removedBackups}`);
}

function cmdSupabaseStatus() {
  const config = readSupabaseConfig();
  if (!config) {
    console.log("Supabase 未配置。");
    console.log(`配置文件位置：${SUPABASE_CONFIG_FILE}`);
    return;
  }

  console.log("Supabase 已配置。");
  console.log(`URL：${config.url}`);
  console.log(`来源：${config.source}`);
  console.log("密钥：已隐藏");
}

function cmdHelp() {
  printSimpleCommands();
  console.log("内部命令：snapshot, backup, checkpoint, last, resume, restore-plan, restore, clean, supabase-status");
}

async function main() {
  switch (command) {
    case "snapshot":
      cmdSnapshot();
      break;
    case "backup":
      await cmdBackup();
      break;
    case "checkpoint":
      await cmdCheckpoint();
      break;
    case "last":
      cmdLast();
      break;
    case "resume":
      cmdResume();
      break;
    case "restore-plan":
      cmdRestorePlan();
      break;
    case "restore":
      cmdRestore();
      break;
    case "clean":
      cmdClean();
      break;
    case "supabase-status":
      cmdSupabaseStatus();
      break;
    case "help":
    case "--help":
    case "-h":
      cmdHelp();
      break;
    default:
      console.error(`未知命令：${command}`);
      cmdHelp();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`codex-recovery 执行失败：${error.message}`);
  process.exitCode = 1;
});
