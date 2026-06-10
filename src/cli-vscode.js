#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const PROFILE = "vscode-codex";
const CLI = "vscode-codex";
const WORKSPACE_ROOT = "D:\\Codex\\VSCode";
const DATA_DIR = path.join("D:\\Codex\\VSCode.codex-recovery");
const DOWNLOAD_DIR = "D:\\Download";
const GLOBAL_DATA_DIR = path.join(os.homedir(), ".codex-recovery");
const SUPABASE_CONFIG_FILE = path.join(GLOBAL_DATA_DIR, "supabase.json");
const CHECKPOINT_FILE = path.join(DATA_DIR, "last-checkpoint.json");
const RESUME_FILE = path.join(DATA_DIR, "resume.md");
const RESTORE_PLAN_FILE = path.join(DATA_DIR, "restore-plan.md");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const VS_CODE_SETTINGS_DIR = path.join(process.env.APPDATA || "", "Code", "User");
const VS_CODE_SETTINGS_FILE = path.join(VS_CODE_SETTINGS_DIR, "settings.json");
const VS_CODE_EXTENSIONS_FILE = path.join(VS_CODE_SETTINGS_DIR, "extensions.json");
const VS_CODE_WORKSPACE_EXTENSIONS_FILE = path.join(WORKSPACE_ROOT, ".vscode", "extensions.json");

const command = process.argv[2] || "help";
const options = {
  download: process.argv.includes("--download"),
  force: process.argv.includes("--force")
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function run(cmd, opts = {}) {
  try {
    return cp
      .execSync(cmd, {
        cwd: opts.cwd || process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        timeout: opts.timeout || 15000
      })
      .trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const stdout = error.stdout ? String(error.stdout).trim() : "";
    return stdout || stderr || null;
  }
}

function detectCommand(name, versionArgs = "--version") {
  const whereOutput = run(`where ${name}`, { timeout: 5000 });
  const whereFound = Boolean(whereOutput && !whereOutput.toLowerCase().includes("could not find"));
  const versionOutput = run(`${name} ${versionArgs}`, { timeout: 10000 });
  const versionOk = Boolean(
    versionOutput &&
      !/could not find|not recognized|不是内部或外部命令|不是内部或外部命令，也不是可运行的程序或批处理文件/i.test(versionOutput)
  );
  let status = "unknown";
  if (whereFound || versionOk) {
    status = "yes";
  } else if (
    (whereOutput && whereOutput.toLowerCase().includes("could not find")) ||
    (versionOutput && /not recognized|could not find|不是内部或外部命令/i.test(versionOutput))
  ) {
    status = "no";
  }
  return {
    status,
    version: versionOk ? versionOutput : null,
    raw: versionOutput || whereOutput || null
  };
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

function fileSummary(filePath) {
  const content = safeRead(filePath);
  return {
    path: filePath,
    exists: Boolean(content !== null),
    size: content === null ? 0 : Buffer.byteLength(content, "utf8"),
    redacted_preview: content === null ? null : redact(content).split(/\r?\n/).slice(0, 20).join("\n")
  };
}

function gitInfo() {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    return {
      is_repo: false,
      branch: null,
      head: null,
      dirty: null,
      status: "workspace path does not exist",
      changed_files: []
    };
  }

  const inside = run("git rev-parse --is-inside-work-tree", { cwd: WORKSPACE_ROOT });
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

  const status = run("git status --short", { cwd: WORKSPACE_ROOT }) || "";
  return {
    is_repo: true,
    branch: run("git branch --show-current", { cwd: WORKSPACE_ROOT }) || null,
    head: run("git rev-parse --short HEAD", { cwd: WORKSPACE_ROOT }) || null,
    dirty: status.length > 0,
    status,
    changed_files: status
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
  };
}

function listVSCodeExtensions() {
  const codeStatus = detectCommand("code");
  if (codeStatus.status !== "yes") {
    return { status: codeStatus.status, extensions: [] };
  }
  const list = run("code --list-extensions", { timeout: 20000 });
  if (!list || /could not find|not recognized|不是内部或外部命令/i.test(list)) {
    return { status: "unknown", extensions: [] };
  }
  return { status: "yes", extensions: list.split(/\r?\n/).filter(Boolean) };
}

function collectSnapshot() {
  const codeStatus = detectCommand("code");
  const codexStatus = detectCommand("codex");
  const extensionResult = codeStatus.status === "yes" ? listVSCodeExtensions() : { status: codeStatus.status, extensions: [] };
  const extensions = extensionResult.extensions || [];
  const codexExtensions = extensions.filter((name) => /codex/i.test(name) || /openai/i.test(name));

  return {
    created_at: nowIso(),
    profile: PROFILE,
    cli: CLI,
    workspace: WORKSPACE_ROOT,
    workspace_exists: fs.existsSync(WORKSPACE_ROOT),
    device: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      user: os.userInfo().username
    },
    tools: {
      code: codeStatus.status,
      codex: codexStatus.status
    },
    vscode: {
      installed: codeStatus.status,
      extensions,
      extension_status: extensionResult.status,
      codex_extensions: codexExtensions,
      has_codex_extension: codexExtensions.length > 0
    },
    files: {
      settings: fileSummary(VS_CODE_SETTINGS_FILE),
      workspace_extensions: fileSummary(VS_CODE_WORKSPACE_EXTENSIONS_FILE),
      extensions: fileSummary(VS_CODE_EXTENSIONS_FILE)
    },
    git: gitInfo()
  };
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function readSupabaseConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (envUrl && envKey) {
    return {
      url: String(envUrl).replace(/\/+$/, ""),
      key: String(envKey),
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
        workspace: WORKSPACE_ROOT,
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
    profile: PROFILE,
    cli: CLI,
    workspace: WORKSPACE_ROOT,
    task: fields.task || "继续 VS Code Codex 工作",
    done: fields.done || "已保存当前 VS Code Codex 工作区状态。",
    todo: fields.todo || "检查恢复说明，然后继续 VS Code Codex 工作。",
    last_command: fields.last_command || null,
    status: fields.status || "checkpoint",
    next_step: fields.next_step || "打开 VS Code Codex 并继续当前任务。",
    updated_at: nowIso(),
    git
  };
}

function formatStatus(status) {
  if (status === "yes") return "是";
  if (status === "no") return "否";
  return "未知";
}

function renderResume(checkpoint) {
  const git = checkpoint.git || {};
  const workspaceExists = fs.existsSync(WORKSPACE_ROOT);
  const codeStatus = checkpoint.tools?.code || "unknown";
  const codexStatus = checkpoint.tools?.codex || "unknown";
  const codexExtStatus = checkpoint.vscode?.has_codex_extension
    ? "yes"
    : checkpoint.vscode?.extension_status === "no"
    ? "no"
    : "unknown";
  const settingsStatus = checkpoint.files?.settings?.exists ? "yes" : checkpoint.files?.settings?.exists === false ? "no" : "unknown";
  const extensionsStatus = checkpoint.files?.workspace_extensions?.exists ? "yes" : checkpoint.files?.workspace_extensions?.exists === false ? "no" : "unknown";

  const missing = [];
  if (!workspaceExists) missing.push("工作区 D:\\Codex\\VSCode 不存在");
  if (codeStatus === "no") missing.push("VS Code 未安装");
  if (codeStatus === "unknown") missing.push("VS Code 安装状态未知");
  if (codexStatus === "no") missing.push("Codex CLI 未安装");
  if (codexStatus === "unknown") missing.push("Codex CLI 状态未知");
  if (codexExtStatus === "no") missing.push("未检测到 Codex 扩展");
  if (codexExtStatus === "unknown") missing.push("Codex 扩展检测状态未知");
  if (settingsStatus === "no") missing.push("VS Code 设置文件不存在");
  if (extensionsStatus === "no") missing.push("工作区扩展推荐文件不存在");

  const canContinue = workspaceExists && codeStatus === "yes" && codexStatus === "yes" && codexExtStatus === "yes" && extensionsStatus === "yes";
  const needsConfirmation = missing.length > 0 || codeStatus !== "yes" || codexStatus !== "yes" || codexExtStatus !== "yes" || extensionsStatus !== "yes";
  const nextPrompt = `请继续我上次在 VS Code Codex 中断的任务。\n不要重新开始。\n请先根据当前 VS Code Codex 的上下文继续。\n如果上下文丢失，请读取本地断点记录：\nD:\\Codex\\VSCode.codex-recovery\\resume.md\n如果这个文件不存在，再读取：\nD:\\Download\\vscode-codex-resume.md\n\n如果可以继续，只告诉我下一步做什么。\n如果不能继续，只告诉我缺少什么。\n不要输出 JSON、配置清单、内部日志或专业文件内容。`;

  return `# VS Code Codex Resume

是否可以继续：${canContinue ? "是" : "否"}

缺少什么：
${missing.length ? missing.map((item) => `- ${item}`).join("\n") : "无缺失"}

是否需要用户确认：${needsConfirmation ? "是" : "否"}

下一步在 VS Code Codex 输入什么提示词：

${nextPrompt}
`;
}

function renderRestorePlan(checkpoint) {
  const workspaceExists = fs.existsSync(WORKSPACE_ROOT);
  return `# VS Code Codex Restore Plan

生成时间：${nowIso()}

## 目标

只恢复 VS Code Codex 任务断点，不做 VS Code 通用重装恢复。

## 固定目录规则

- 专属工作目录：${WORKSPACE_ROOT}
- 本地运行数据目录：${DATA_DIR}
- 导出文档目录：${DOWNLOAD_DIR}

## 当前检查

- VS Code 安装：${checkpoint.vscode?.installed ? "已安装" : "未检测到"}
- Codex CLI 安装：${checkpoint.tools?.codex ? "已安装" : "未检测到"}
- Codex 扩展：${checkpoint.vscode?.has_codex_extension ? "已安装" : "未检测到"}
- 工作区目录：${workspaceExists ? "存在" : "不存在"}
- 最近 checkpoint：${fs.existsSync(CHECKPOINT_FILE) ? "存在" : "不存在"}

## 建议步骤

1. 检查 VS Code 是否安装。
2. 检查 Codex 扩展是否存在。
3. 查看当前任务断点说明。
4. 继续 VS Code Codex 当前工作。

## 最近任务断点

${renderResume(checkpoint)}
`;
}

function writeDownloadFile(baseName, content) {
  try {
    ensureDir(DOWNLOAD_DIR);
  } catch {
    return null;
  }

  const filePath = path.join(DOWNLOAD_DIR, baseName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function writeRecoveryOperationGuide() {
  const content = `VS Code Codex 中断后断点续传操作指南

当发生中断（断电、断网、刷新、VS Code 异常关闭、Codex 卡住）后，默认恢复入口是 VS Code Codex 对话框。

步骤 1：重新打开 VS Code。
步骤 2：确认已经登录 Codex 账号。
步骤 3：打开 VS Code 右侧的 CODEX 对话框。
步骤 4：输入以下提示词：

请继续我上次在 VS Code Codex 中断的任务。
不要重新开始。
请根据当前 VS Code Codex 的上下文和本地断点记录继续。
如果能继续，只告诉我下一步做什么。
如果不能继续，只告诉我缺少什么。
不要输出 JSON、配置清单、内部日志或专业文件内容。

步骤 5：根据 Codex 给出的下一步继续操作。

备用方式：
只有在 VS Code Codex 无法正常打开、无法登录、无法读取上次任务时，才使用 PowerShell 或本地恢复命令检查。

备用检查命令：
cd D:\\Codex\\Windows\\workspace\\codex-recovery
node .\\src\\cli-vscode.js resume --download
`;
  return writeDownloadFile("vscode-codex-recovery-operation-guide.txt", content);
}

function cmdSnapshot() {
  ensureDir(SNAPSHOT_DIR);
  const snapshot = collectSnapshot();
  const filePath = path.join(SNAPSHOT_DIR, `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeJson(filePath, snapshot);
  console.log(`本地环境快照已生成：${filePath}`);
}

function cmdCheckpoint() {
  ensureDir(DATA_DIR);
  const snapshot = collectSnapshot();
  const checkpoint = createAutomaticCheckpoint({ task: process.argv.slice(3).join(" ") || undefined });
  checkpoint.tools = snapshot.tools;
  checkpoint.vscode = snapshot.vscode;
  checkpoint.files = snapshot.files;
  writeJson(CHECKPOINT_FILE, checkpoint);
  fs.writeFileSync(RESUME_FILE, renderResume(checkpoint), "utf8");
  console.log(`任务断点已保存：${CHECKPOINT_FILE}`);
  console.log(`恢复说明已生成：${RESUME_FILE}`);
}

function cmdLast() {
  const checkpoint = readCheckpoint();
  if (!checkpoint) {
    console.log("还没有任务断点。可以先运行 vscode-codex checkpoint 保存一次。");
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
      done: "未找到旧断点，已根据当前 VS Code Codex 工作区自动生成基础断点。",
      todo: "检查当前工作区和 Git 状态，然后继续 VS Code Codex。",
      next_step: "打开 VS Code 并继续当前任务。"
    });
  }

  const snapshot = collectSnapshot();
  checkpoint.tools = snapshot.tools;
  checkpoint.vscode = snapshot.vscode;
  checkpoint.files = snapshot.files;
  checkpoint.git = snapshot.git;
  checkpoint.workspace = snapshot.workspace;
  checkpoint.updated_at = nowIso();

  writeJson(CHECKPOINT_FILE, checkpoint);
  const resume = renderResume(checkpoint);
  fs.writeFileSync(RESUME_FILE, resume, "utf8");
  console.log(resume);
  console.log(`恢复说明文件：${RESUME_FILE}`);

  if (options.download) {
    const exportedResume = writeDownloadFile("vscode-codex-resume.md", resume);
    const exportedGuide = writeRecoveryOperationGuide();
    if (exportedResume && exportedGuide) {
      console.log(`已覆盖文件：D:\\Download\\vscode-codex-resume.md`);
      console.log(`已覆盖文件：D:\\Download\\vscode-codex-recovery-operation-guide.txt`);
    } else {
      console.log("导出到 D:\\Download 失败。请检查目录权限。" );
    }
  }
}

function cmdRestorePlan() {
  ensureDir(DATA_DIR);
  let checkpoint = readCheckpoint();
  if (!checkpoint) {
    checkpoint = createAutomaticCheckpoint({
      status: "auto-created",
      done: "未找到旧断点，已根据当前 VS Code Codex 工作区自动生成基础断点。",
      todo: "检查当前工作区和 Git 状态，然后继续 VS Code Codex。",
      next_step: "打开 VS Code 并继续当前任务。"
    });
    writeJson(CHECKPOINT_FILE, checkpoint);
  }

  const plan = renderRestorePlan(checkpoint);
  ensureDir(DATA_DIR);
  fs.writeFileSync(RESTORE_PLAN_FILE, plan, "utf8");
  console.log(`恢复计划已生成：${RESTORE_PLAN_FILE}`);

  if (options.download) {
    const exported = writeDownloadFile("vscode-codex-restore-plan.md", plan);
    if (exported) {
      console.log(`已导出到 D:\\Download：${exported}`);
    } else {
      console.log("导出到 D:\\Download 失败。请检查目录权限。" );
    }
  }
}

function cmdRestore() {
  console.log("vscode-codex restore 仅生成恢复计划，不会静默安装或覆盖配置。");
  return cmdRestorePlan();
}

function removeOldFiles(dir, keepLatest) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const removed = files.slice(keepLatest);
  for (const file of removed) fs.unlinkSync(file);
  return removed.length;
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
    console.log("Supabase 未配置。请在环境变量或 ~/.codex-recovery/supabase.json 中设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。\n");
    return;
  }
  console.log("Supabase 已配置。" );
  console.log(`URL：${config.url}`);
  console.log(`来源：${config.source}`);
  console.log("密钥：已隐藏");
}

function cmdSupabaseSync() {
  const config = readSupabaseConfig();
  if (!config) {
    console.log("Supabase 未配置。请先设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。" );
    return Promise.resolve();
  }

  const checkpoint = createAutomaticCheckpoint({
    task: "vscode-codex 第三入口已完成",
    done: "默认恢复入口是 VS Code Codex 对话框。PowerShell 只是备用检查方式。D:\\Download 已生成中文 resume 和操作指南。",
    todo: "继续在 VS Code Codex 对话框中恢复当前任务。",
    last_command: "vscode-codex resume --download",
    status: "vscode-codex 第三入口已完成",
    next_step: "打开 VS Code Codex 对话框继续当前任务。"
  });
  checkpoint.breakpoint_dir = DATA_DIR;

  return uploadCheckpointToSupabase(checkpoint, config)
    .then(() => {
      console.log("已将 vscode-codex 状态安全同步到 Supabase。" );
    })
    .catch((error) => {
      console.error(`Supabase 同步失败：${error.message}`);
      process.exitCode = 1;
    });
}

function cmdHelp() {
  console.log(`
VS Code Codex 任务恢复工具

用法:
  vscode-codex <command> [--download] [--force]

命令:
  snapshot       生成本地环境快照
  checkpoint     保存当前断点
  last           查看最近断点
  resume         生成恢复说明
  restore-plan   生成恢复计划
  restore        与 restore-plan 等效，显示恢复计划
  clean          清理旧快照和备份
  supabase-status 显示 Supabase 配置状态
  supabase-sync   将 vscode-codex 状态同步到 Supabase
  help           显示帮助

可选参数:
  --download     同时导出说明文件到 D:\\Download
  --force        如果 Export 文件同名，允许覆盖
`);
}

function main() {
  switch (command) {
    case "snapshot":
      cmdSnapshot();
      break;
    case "checkpoint":
      cmdCheckpoint();
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
    case "supabase-sync":
      cmdSupabaseSync();
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

main();
