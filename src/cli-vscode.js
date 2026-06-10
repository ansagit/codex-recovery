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
const DOWNLOAD_RESUME_FILE = path.join(DOWNLOAD_DIR, "vscode-codex-resume.md");
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

function writeResumeFiles(checkpoint) {
  const resume = renderResume(checkpoint);
  ensureDir(DATA_DIR);
  fs.writeFileSync(RESUME_FILE, resume, "utf8");
  try {
    ensureDir(DOWNLOAD_DIR);
    fs.writeFileSync(DOWNLOAD_RESUME_FILE, resume, "utf8");
  } catch (error) {
    // 如果 D:\Download 无法写入，不影响本地断点保存
  }
  return resume;
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

function createAutomaticCheckpoint(fields = {}, snapshot = null) {
  const base = readCheckpoint() || {};
  const source = snapshot || collectSnapshot();
  return {
    profile: PROFILE,
    cli: CLI,
    workspace: WORKSPACE_ROOT,
    task: fields.task || base.task || "继续上次 VS Code Codex 任务",
    done: fields.done || base.done || "已完成的任务未记录，请参考前次断点摘要。",
    paused_at: fields.paused_at || base.paused_at || "已停止在上次未完成的任务点。",
    todo: fields.todo || base.todo || "继续当前任务并保持工作区状态同步。",
    next_step: fields.next_step || base.next_step || "打开 VS Code Codex，继续当前任务。",
    last_command: fields.last_command || base.last_command || process.argv.slice(2).join(" ") || "vscode-codex resume",
    status: fields.status || base.status || "进行中",
    updated_at: nowIso(),
    git: source.git,
    tools: source.tools,
    vscode: source.vscode,
    files: source.files,
    breakpoint_dir: DATA_DIR
  };
}

function updateCheckpoint(fields = {}) {
  const snapshot = collectSnapshot();
  const checkpoint = createAutomaticCheckpoint(fields, snapshot);
  writeJson(CHECKPOINT_FILE, checkpoint);
  const resume = writeResumeFiles(checkpoint);
  return { checkpoint, resume };
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
  const needsConfirmation = missing.length > 0 || codeStatus !== "yes" || codexStatus !== "yes" || codexExtStatus !== "yes";

  return `# VS Code Codex Resume

上次任务：${checkpoint.task || "未记录具体任务。"}
已完成：${checkpoint.done || "未记录已完成内容。"}
当前进度：${checkpoint.paused_at || checkpoint.current || checkpoint.status || "未记录当前暂停点。"}
未完成：${checkpoint.todo || "未记录待完成内容。"}
下一步：${checkpoint.next_step || "请打开 VS Code Codex 并继续当前任务。"}
是否需要确认：${checkpoint.confirm || (needsConfirmation ? "是" : "否")}
更新时间：${checkpoint.updated_at || nowIso()}
`;
}

function parseResumeContent(content) {
  const data = {};
  let currentKey = null;
  const keyMap = {
    上次任务: "task",
    已完成: "done",
    当前进度: "current",
    停在: "current",
    未完成: "todo",
    下一步: "next_step",
    是否需要用户确认: "confirm",
    是否需要确认: "confirm",
    更新时间: "updated_at"
  };

  function appendLine(key, text) {
    if (!text) return;
    if (!data[key]) data[key] = text;
    else data[key] += (data[key].endsWith("\n") ? "" : "\n") + text;
  }

  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = line.match(/^(?:#{1,2}\s*)?(上次任务|已完成|当前进度|停在|未完成|下一步|是否需要用户确认|是否需要确认|更新时间)[:：]?$/);
    if (headerMatch) {
      currentKey = keyMap[headerMatch[1]];
      continue;
    }

    const inlineMatch = line.match(/^(上次任务|已完成|当前进度|停在|未完成|下一步|是否需要用户确认|是否需要确认|更新时间)[:：]\s*(.*)$/);
    if (inlineMatch) {
      const key = keyMap[inlineMatch[1]];
      if (key) {
        data[key] = inlineMatch[2].trim();
      }
      currentKey = null;
      continue;
    }

    if (currentKey) {
      appendLine(currentKey, line);
    }
  }

  if (!data.confirm) data.confirm = "否";
  return data;
}

function hasRealResume(data) {
  if (!data || typeof data !== "object") return false;
  const required = ["task", "done", "current", "todo", "next_step", "confirm", "updated_at"];
  for (const key of required) {
    if (!data[key] || !String(data[key]).trim()) return false;
  }
  const placeholders = [
    "未记录具体任务。",
    "未记录已完成内容。",
    "未记录当前暂停点。",
    "未记录待完成内容。",
    "请打开 VS Code Codex 并继续当前任务。",
    "已完成的任务未记录",
    "已停止在上次未完成的任务点",
    "继续当前任务并保持工作区状态同步",
    "打开 VS Code Codex，继续当前任务"
  ];
  return ![data.task, data.done, data.current, data.todo, data.next_step].some((value) => {
    const text = String(value).trim();
    return placeholders.some((placeholder) => text.includes(placeholder));
  });
}

function loadVscodeResumeFile() {
  const candidates = [RESUME_FILE, DOWNLOAD_RESUME_FILE];
  let fallback = null;
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const content = safeRead(filePath);
    if (!content) continue;
    const parsed = parseResumeContent(content);
    parsed.source = filePath;
    if (hasRealResume(parsed)) return parsed;
    fallback = parsed;
  }
  return fallback;
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

继续上次任务

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
  const filePath = path.join(SNAPSHOT_DIR, "snapshot.json");
  writeJson(filePath, snapshot);
  console.log(`本地环境快照已生成：${filePath}`);
}

function cmdCheckpoint() {
  const { checkpoint } = updateCheckpoint({ task: process.argv.slice(3).join(" ") || undefined });
  console.log(`任务断点已保存：${CHECKPOINT_FILE}`);
  console.log(`恢复说明已生成：${RESUME_FILE}`);
  console.log(`固定导出文件：${DOWNLOAD_RESUME_FILE}`);
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
  const resumeData = loadVscodeResumeFile();
  if (!resumeData) {
    console.log("未找到 VS Code Codex 专属断点文件，请检查 D:\\Codex\\VSCode.codex-recovery\\resume.md 或 D:\\Download\\vscode-codex-resume.md 是否存在。");
    return;
  }

  if (!hasRealResume(resumeData)) {
    console.log("断点文件缺少真实任务摘要。");
    return;
  }

  console.log(`上次任务：\n${resumeData.task}\n\n已完成：\n${resumeData.done}\n\n当前进度：\n${resumeData.current}\n\n未完成：\n${resumeData.todo}\n\n下一步：\n${resumeData.next_step}\n\n是否需要确认：\n${resumeData.confirm}`);
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
