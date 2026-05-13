#!/usr/bin/env node
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const toolDir = path.resolve(srcDir, "..");
const root = path.resolve(toolDir, "..", "..");
const label = "com.lizhengda.investment-research.weixin-bridge";
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const stateDir = path.join(toolDir, "state");
const logsDir = path.join(stateDir, "logs");
const stdoutPath = path.join(logsDir, "service.out.log");
const stderrPath = path.join(logsDir, "service.err.log");
const serverPath = path.join(toolDir, "dist", "weixin-server.js");
const domainTarget = `gui/${process.getuid()}`;

type RunOptions = {
  inherit?: boolean;
  allowFailure?: boolean;
};

function usage() {
  console.log(`Usage:
  node dist/weixin-service.js install [--codex] [--write] [--no-listen] [--port=N] [--host=H] [--token=T]
  node dist/weixin-service.js start
  node dist/weixin-service.js stop
  node dist/weixin-service.js restart
  node dist/weixin-service.js status
  node dist/weixin-service.js uninstall

Notes:
  - 安装的是 HTTP 服务（dist/weixin-server.js）。
  - 默认监听 127.0.0.1:8787，同进程包含微信长轮询监听。
  - --codex 会在收到入站消息时调 codex 自动回复；不加该参数则只收入到 inbox。`);
}

function run(cmd, args, opts: RunOptions = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && !opts.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

function nodeMajor(versionText) {
  const match = String(versionText || "").trim().match(/^v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function nodeVersionOf(binPath) {
  const result = spawnSync(binPath, ["-v"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function resolveNodePath() {
  const forced = process.env.WEIXIN_BRIDGE_NODE_PATH?.trim();
  if (forced) return forced;

  const shellNode = spawnSync("/bin/zsh", ["-lc", "command -v node"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).stdout.trim();
  if (shellNode && nodeMajor(nodeVersionOf(shellNode)) >= 22) return shellNode;

  if (nodeMajor(process.version) >= 22) return process.execPath;
  return shellNode || process.execPath;
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stringEntry(value) {
  return `    <string>${xmlEscape(value)}</string>`;
}

function plist(serverArgs, envVars) {
  const nodePath = resolveNodePath();
  const envEntries = Object.entries(envVars)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `    <key>${xmlEscape(k)}</key>\n    <string>${xmlEscape(String(v))}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${[nodePath, serverPath, ...serverArgs].map(stringEntry).join("\n")}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(toolDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderrPath)}</string>
</dict>
</plist>
`;
}

function parseFlagValue(args, name) {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  return undefined;
}

async function ensureLaunchAgentDirs() {
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
}

async function ensureServerBuilt() {
  try {
    await fs.access(serverPath);
  } catch {
    throw new Error(`未找到服务入口：${serverPath}。请先在 tools/weixin-bridge 下执行 npm run build。`);
  }
}

function serviceTarget() {
  return `${domainTarget}/${label}`;
}

function isLoaded() {
  const result = run("launchctl", ["print", serviceTarget()], { allowFailure: true });
  return result.status === 0;
}

function bootoutLoadedService() {
  if (!isLoaded()) return;
  run("launchctl", ["bootout", serviceTarget()], { allowFailure: true });
}

async function install(args) {
  await ensureLaunchAgentDirs();
  await ensureServerBuilt();
  const nodePath = resolveNodePath();

  const serverArgs = [];
  if (args.includes("--codex")) serverArgs.push("--codex");
  if (args.includes("--write")) serverArgs.push("--write");
  if (args.includes("--no-listen")) serverArgs.push("--no-listen");

  const port = parseFlagValue(args, "--port");
  const host = parseFlagValue(args, "--host");
  const token = parseFlagValue(args, "--token");

  const envVars = {
    WEIXIN_BRIDGE_STANDALONE: "1",
    WEIXIN_BRIDGE_STATE: stateDir,
    OPENCLAW_STATE_DIR: stateDir,
    CLAWDBOT_STATE_DIR: stateDir,
    WEIXIN_API_PORT: port || "8787",
    WEIXIN_API_HOST: host || "127.0.0.1",
    WEIXIN_API_TOKEN: token,
    WEIXIN_BRIDGE_NODE_PATH: nodePath,
    HOME: os.homedir(),
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
    LANG: process.env.LANG || "en_US.UTF-8",
  };

  const nodeVersion = nodeVersionOf(nodePath);
  bootoutLoadedService();
  await fs.writeFile(plistPath, plist(serverArgs, envVars), "utf8");
  console.log(`Installed ${plistPath}`);
  console.log(`Node: ${nodePath}${nodeVersion ? ` (${nodeVersion})` : ""}`);
  console.log(`Server flags: ${serverArgs.join(" ") || "(默认)"}`);
  console.log(`Env: WEIXIN_API_HOST=${host || "127.0.0.1"} WEIXIN_API_PORT=${port || 8787} WEIXIN_API_TOKEN=${token ? "<set>" : "<none>"} WEIXIN_BRIDGE_STATE=${stateDir}`);
  await start();
}

async function start() {
  await ensureLaunchAgentDirs();
  await ensureServerBuilt();
  try {
    await fs.access(plistPath);
  } catch {
    throw new Error(`未找到服务配置：${plistPath}。请先执行 install。`);
  }
  bootoutLoadedService();
  run("launchctl", ["bootstrap", domainTarget, plistPath], { allowFailure: true });
  run("launchctl", ["enable", serviceTarget()], { allowFailure: true });
  run("launchctl", ["kickstart", "-k", serviceTarget()], { allowFailure: true });
  console.log("Started weixin bridge service.");
}

async function stop() {
  bootoutLoadedService();
  console.log("Stopped weixin bridge service.");
}

async function restart() {
  await stop();
  await start();
}

async function status() {
  const result = run("launchctl", ["print", serviceTarget()], { allowFailure: true });
  if (result.status === 0) {
    console.log(result.stdout.trim());
  } else {
    console.log("Service is not loaded.");
  }
  console.log(`plist: ${plistPath}`);
  console.log(`server: ${serverPath}`);
  console.log(`state: ${stateDir}`);
  console.log(`stdout: ${stdoutPath}`);
  console.log(`stderr: ${stderrPath}`);
}

async function uninstall() {
  await stop();
  await fs.rm(plistPath, { force: true });
  console.log(`Removed ${plistPath}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (!cmd || cmd === "--help" || cmd === "help") return usage();
    if (cmd === "install") return await install(args);
    if (cmd === "start") return await start();
    if (cmd === "stop") return await stop();
    if (cmd === "restart") return await restart();
    if (cmd === "status") return await status();
    if (cmd === "uninstall") return await uninstall();
    throw new Error(`Unknown command: ${cmd}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

await main();
