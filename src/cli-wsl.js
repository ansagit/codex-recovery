#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const PROFILE = "wsl-cli";
const CLI = "wsl-cli";
const WORKSPACE_ROOT = "/mnt/d/Codex/WSL/workspace";
const DATA_DIR = path.join(WORKSPACE_ROOT, "codex-recovery", ".codex-recovery");
const GLOBAL_DATA_DIR = path.join(os.homedir(), ".codex-recovery");
const SUPABASE_CONFIG_FILE = path.join(GLOBAL_DATA_DIR, "supabase.json");
const CHECKPOINT_FILE = path.join(DATA_DIR, "last-checkpoint.json");
const RESUME_FILE = path.join(DATA_DIR, "resume.md");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const command = process.argv[2] || "help";

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(cmd, options = {}) {
  try {
    return cp.execSync(cmd, {
      cwd: options.cwd || WORKSPACE_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout || 15000
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const stdout = error.stdout ? String(error.stdout).trim() : "";
    return stdout || stderr || null;
  }
}

function commandPath(name) {
  return run(`command -v ${shellQuote(name)}`, { timeout: 5000 });
}

function commandVersion(name, args = "--version") {
  if (!commandPath(name)) return "not found";
  return run(`${shellQuote(name)} ${args}`, { timeout: 10000 }) || "installed";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
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
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(ghp_[A-Za-z0-9_]{12,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(github_pat_[A-Za-z0-9_]{12,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(sb_secret_[A-Za-z0-9_.-]{12,})/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, "[REDACTED_JWT]")
    .replace(/((password|passwd|pwd|token|secret|apikey|api_key|key)\s*[:=]\s*)([^\s"']+)/gi, "$1[REDACTED]");
}

function fileSummary(filePath) {
  const content = safeRead(filePath);
  return {
    path: filePath,
    exists: Boolean(content !== null),
    bytes: content === null ? 0 : Buffer.byteLength(content, "utf8"),
    redacted_preview: content === null ? null : redact(content).split(/\r?\n/).slice(0, 12).join("\n")
  };
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

function currentDeviceId() {
  return `${os.hostname().toLowerCase()}-wsl-cli`;
}

function baseRecord() {
  return {
    profile: PROFILE,
    cli: CLI,
    device_id: currentDeviceId(),
    workspace: WORKSPACE_ROOT
  };
}

function collectCodexConfig() {
  const codexDir = path.join(os.homedir(), ".codex");
  const configFile = path.join(codexDir, "config.toml");
  return {
    config_toml: {
      path: configFile,
      exists: fs.existsSync(configFile),
      content: redact(safeRead(configFile))
    },
    excluded: [
      "auth.json",
      "history.jsonl",
      "sessions/",
      "logs_*.sqlite",
      "state_*.sqlite",
      "goals_*.sqlite",
      "memories_*.sqlite"
    ]
  };
}

function collectSnapshot() {
  return {
    ...baseRecord(),
    created_at: nowIso(),
    device: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      user: os.userInfo().username
    },
    wsl: {
      uname: run("uname -a"),
      release: run("lsb_release -ds") || run("cat /etc/os-release")
    },
    tools: {
      git: commandVersion("git"),
      node: commandVersion("node"),
      npm: commandVersion("npm"),
      pnpm: commandVersion("pnpm"),
      python3: commandVersion("python3"),
      gh: commandVersion("gh"),
      codex: commandVersion("codex")
    },
    command_paths: {
      git: commandPath("git"),
      node: commandPath("node"),
      npm: commandPath("npm"),
      pnpm: commandPath("pnpm"),
      python3: commandPath("python3"),
      gh: commandPath("gh"),
      codex: commandPath("codex")
    },
    npm_global_packages: redact(run("npm ls -g --depth=0 --json", { timeout: 30000 })),
    git_config: redact(run("git config --global --list")),
    shell_configs: {
      bashrc: fileSummary(path.join(os.homedir(), ".bashrc")),
      profile: fileSummary(path.join(os.homedir(), ".profile")),
      zshrc: fileSummary(path.join(os.homedir(), ".zshrc"))
    },
    codex: collectCodexConfig(),
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

async function supabaseGet(config, table, query) {
  return supabaseRequest(config, table, { method: "GET", query });
}

async function uploadCheckpointToSupabase(checkpoint, existingConfig) {
  const config = existingConfig || readSupabaseConfig();
  if (!config) return { uploaded: false, reason: "Supabase is not configured." };

  await supabaseRequest(config, "checkpoints", {
    headers: { Prefer: "return=minimal" },
    body: [
      {
        ...baseRecord(),
        checkpoint
      }
    ]
  });

  return { uploaded: true, source: config.source };
}

async function uploadBackupToSupabase(snapshot, backupFile) {
  const config = readSupabaseConfig();
  if (!config) return { uploaded: false, reason: "Supabase is not configured." };

  await supabaseRequest(config, "devices", {
    query: "?on_conflict=device_id",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [
      {
        ...baseRecord(),
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
        ...baseRecord(),
        backup_file: backupFile,
        snapshot
      }
    ]
  });

  const checkpoint = readCheckpoint();
  if (checkpoint) await uploadCheckpointToSupabase(checkpoint, config);

  return { uploaded: true, source: config.source };
}

function readCheckpoint() {
  return readJson(CHECKPOINT_FILE);
}

function createAutomaticCheckpoint(fields = {}) {
  return {
    ...baseRecord(),
    task: fields.task || "Continue previous Codex work",
    done: fields.done || "Current WSL workspace state has been saved.",
    todo: fields.todo || "Open the resume note, confirm the next step, then continue Codex.",
    last_command: fields.last_command || null,
    status: fields.status || "checkpoint",
    next_step: fields.next_step || "Run: cd /mnt/d/Codex/WSL/workspace; codex",
    updated_at: nowIso(),
    git: gitInfo()
  };
}

function renderResume(checkpoint) {
  const git = checkpoint.git || {};
  return `# Codex Recovery Resume

Updated: ${checkpoint.updated_at || nowIso()}

## Profile

- profile: ${checkpoint.profile || PROFILE}
- cli: ${checkpoint.cli || CLI}
- device_id: ${checkpoint.device_id || currentDeviceId()}
- workspace: ${checkpoint.workspace || WORKSPACE_ROOT}

## Last Task

${checkpoint.task || "Not recorded"}

## Done

${checkpoint.done || "Not recorded"}

## Todo

${checkpoint.todo || "Not recorded"}

## Next Step

${checkpoint.next_step || "Run: cd /mnt/d/Codex/WSL/workspace; codex"}

## Git Status

- repo: ${git.is_repo ? "yes" : "no"}
- branch: ${git.branch || "none"}
- HEAD: ${git.head || "none"}
- dirty: ${git.dirty === null ? "unknown" : git.dirty ? "yes" : "no"}

## Changed Files

${(git.changed_files || []).length ? git.changed_files.map((file) => `- ${file}`).join("\n") : "No record"}
`;
}

function printSimpleCommands() {
  console.log(`
You only need these 3 commands:

Daily start:
cd /mnt/d/Codex/WSL/workspace; codex

Resume after interruption:
cd /mnt/d/Codex/WSL/workspace; codex-recovery resume

Recover after reinstall or on a new WSL environment:
curl -fsSL https://raw.githubusercontent.com/ansagit/codex-recovery/main/install-wsl.sh -o install-wsl.sh
bash install-wsl.sh
`);
}

function cmdSnapshot() {
  ensureDir(SNAPSHOT_DIR);
  const snapshot = collectSnapshot();
  const filePath = path.join(SNAPSHOT_DIR, `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeJson(filePath, snapshot);
  console.log(`Environment snapshot saved: ${filePath}`);
}

async function cmdCheckpoint() {
  const checkpoint = createAutomaticCheckpoint({
    task: process.argv.slice(3).join(" ") || undefined
  });
  writeJson(CHECKPOINT_FILE, checkpoint);
  fs.writeFileSync(RESUME_FILE, renderResume(checkpoint), "utf8");
  console.log(`Checkpoint saved: ${CHECKPOINT_FILE}`);
  console.log(`Resume note generated: ${RESUME_FILE}`);

  const upload = await uploadCheckpointToSupabase(checkpoint);
  if (upload.uploaded) {
    console.log("Checkpoint uploaded to Supabase.");
  } else {
    console.log("Supabase is not configured. Checkpoint saved locally only.");
  }
}

function cmdLast() {
  const checkpoint = readCheckpoint();
  if (!checkpoint) {
    console.log('No checkpoint yet. Run: codex-recovery checkpoint "task note"');
    return;
  }
  console.log(renderResume(checkpoint));
}

async function fetchRemoteRestoreData() {
  const config = readSupabaseConfig();
  if (!config) return { configured: false, devices: [], backups: [], checkpoints: [] };

  const devices = await supabaseGet(
    config,
    "devices",
    "?select=device_id,profile,cli,hostname,platform,workspace,last_seen_at&order=last_seen_at.desc&limit=10"
  );
  const backups = await supabaseGet(
    config,
    "backups",
    "?select=id,device_id,profile,cli,workspace,backup_file,created_at&order=created_at.desc&limit=10"
  );
  const checkpoints = await supabaseGet(
    config,
    "checkpoints",
    "?select=id,device_id,profile,cli,workspace,checkpoint,created_at&order=created_at.desc&limit=5"
  );

  return {
    configured: true,
    devices: devices || [],
    backups: backups || [],
    checkpoints: checkpoints || []
  };
}

function cmdResume() {
  ensureDir(DATA_DIR);
  let checkpoint = readCheckpoint();
  if (!checkpoint) {
    checkpoint = createAutomaticCheckpoint({
      status: "auto-created",
      done: "No existing checkpoint was found. A basic WSL checkpoint was created from the current workspace.",
      todo: "Check the WSL workspace and Git status, then continue Codex."
    });
    writeJson(CHECKPOINT_FILE, checkpoint);
  }

  const resume = renderResume(checkpoint);
  fs.writeFileSync(RESUME_FILE, resume, "utf8");
  console.log(resume);
  console.log(`Resume note: ${RESUME_FILE}`);
  console.log("");
  console.log("Continue command:");
  console.log("cd /mnt/d/Codex/WSL/workspace; codex");
}

function copyConfigBackup(snapshot, snapshotFile) {
  ensureDir(BACKUP_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `backup-${stamp}.json`);
  snapshot.backup = {
    type: "local",
    supabase_uploaded: false,
    reason: "Supabase credentials are not configured yet.",
    snapshot_file: snapshotFile || null
  };
  writeJson(backupFile, snapshot);
  return backupFile;
}

async function cmdBackup() {
  ensureDir(SNAPSHOT_DIR);
  const snapshot = collectSnapshot();
  const snapshotFile = path.join(SNAPSHOT_DIR, `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeJson(snapshotFile, snapshot);
  const backupFile = copyConfigBackup(snapshot, snapshotFile);

  console.log(`Local environment snapshot saved: ${snapshotFile}`);
  console.log(`Local backup package saved: ${backupFile}`);

  const upload = await uploadBackupToSupabase(snapshot, backupFile);
  if (upload.uploaded) {
    console.log("Backup uploaded to Supabase.");
  } else {
    console.log("Supabase is not configured. Backup saved locally only.");
  }
}

function renderRemoteRestoreSection(remote) {
  if (!remote.configured) {
    return `## Supabase Records

Supabase is not configured. Only local checkpoints and local backups are available.
`;
  }

  const devices = remote.devices.length
    ? remote.devices.map((device) => `- ${device.device_id} / ${device.profile || "unknown"} / ${device.cli || "unknown"} / ${device.workspace || "no workspace"} / ${device.last_seen_at}`).join("\n")
    : "No device records";
  const backups = remote.backups.length
    ? remote.backups.map((backup) => `- ${backup.device_id} / ${backup.profile || "unknown"} / ${backup.cli || "unknown"} / ${backup.workspace || "no workspace"} / ${backup.created_at}`).join("\n")
    : "No backup records";
  const checkpoints = remote.checkpoints.length
    ? remote.checkpoints.map((item) => {
        const checkpoint = item.checkpoint || {};
        return `- ${item.device_id} / ${item.profile || "unknown"} / ${item.cli || "unknown"} / ${checkpoint.task || "no task"} / ${item.created_at}`;
      }).join("\n")
    : "No checkpoint records";

  return `## Supabase Records

### Devices

${devices}

### Recent Backups

${backups}

### Recent Checkpoints

${checkpoints}
`;
}

async function cmdRestorePlan() {
  const checkpoint = readCheckpoint();
  const remote = await fetchRemoteRestoreData();
  const plan = `# Codex Recovery Restore Plan

Generated: ${nowIso()}

## Recovery Principle

Show the plan first. The WSL installer does not silently overwrite user configuration.

## Current Profile

- profile: ${PROFILE}
- cli: ${CLI}
- device_id: ${currentDeviceId()}
- workspace: ${WORKSPACE_ROOT}

## Suggested Steps

1. Check Git, Node.js, npm, python3, and Codex CLI.
2. Confirm WSL Codex config path: ${path.join(os.homedir(), ".codex", "config.toml")}
3. Review the latest checkpoint.
4. Continue with: cd /mnt/d/Codex/WSL/workspace; codex

${renderRemoteRestoreSection(remote)}

## Latest Local Checkpoint

${checkpoint ? renderResume(checkpoint) : "No local checkpoint yet."}
`;
  const planFile = path.join(DATA_DIR, "restore-plan.md");
  ensureDir(DATA_DIR);
  fs.writeFileSync(planFile, plan, "utf8");
  console.log(`Restore plan generated: ${planFile}`);
}

function cmdRestore() {
  console.log("WSL restore currently generates a restore plan only. It does not silently install or overwrite configuration.");
  return cmdRestorePlan();
}

function removeOldFiles(dir, keepLatest) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const removable = files.slice(keepLatest);
  for (const file of removable) fs.unlinkSync(file);
  return removable.length;
}

function cmdClean() {
  const keepLatest = 5;
  const removedSnapshots = removeOldFiles(SNAPSHOT_DIR, keepLatest);
  const removedBackups = removeOldFiles(BACKUP_DIR, keepLatest);
  console.log(`Clean complete. Kept latest ${keepLatest} snapshots and backups.`);
  console.log(`Snapshots removed: ${removedSnapshots}`);
  console.log(`Backups removed: ${removedBackups}`);
}

function cmdSupabaseStatus() {
  const config = readSupabaseConfig();
  if (!config) {
    console.log("Supabase is not configured.");
    console.log(`Config file path: ${SUPABASE_CONFIG_FILE}`);
    return;
  }

  console.log("Supabase is configured.");
  console.log(`URL: ${config.url}`);
  console.log(`Source: ${config.source}`);
  console.log("Key: hidden");
}

function cmdHelp() {
  printSimpleCommands();
  console.log("Internal commands: snapshot, backup, checkpoint, last, resume, restore-plan, restore, clean, supabase-status");
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
      await cmdRestorePlan();
      break;
    case "restore":
      await cmdRestore();
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
      console.error(`Unknown command: ${command}`);
      cmdHelp();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`codex-recovery failed: ${error.message}`);
  if (String(error.message || "").includes("Could not find the 'cli' column")) {
    console.error("Supabase schema is missing WSL isolation columns.");
    console.error("Run docs/supabase_wsl_migration.sql in Supabase SQL Editor, then retry.");
  }
  process.exitCode = 1;
});
