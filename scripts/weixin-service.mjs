#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const label = "com.lizhengda.investment-research.weixin-bridge";
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const stateDir = path.join(root, ".weixin-bridge");
const logsDir = path.join(stateDir, "logs");
const stdoutPath = path.join(logsDir, "service.out.log");
const stderrPath = path.join(logsDir, "service.err.log");
const nodePath = process.execPath;
const serverPath = path.join(root, "scripts", "weixin-server.mjs");

function usage() {
  console.log(`Usage:
  node scripts/weixin-service.mjs install [--codex] [--write] [--no-listen] [--port=N] [--host=H] [--token=T]
  node scripts/weixin-service.mjs start
  node scripts/weixin-service.mjs stop
  node scripts/weixin-service.mjs restart
  node scripts/weixin-service.mjs status
  node scripts/weixin-service.mjs uninstall

Notes:
  - 安装的是 HTTP 服务（scripts/weixin-server.mjs）。
  - 默认监听 127.0.0.1:8787，同进程包含微信长轮询监听。
  - --codex 会在收到入站消息时调 codex 自动回复；不加该参数则只收入到 inbox。`);
}

function run(cmd, args, opts = {}) {
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
  <string>${xmlEscape(root)}</string>
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

async function install(args) {
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });

  const serverArgs = [];
  if (args.includes("--codex")) serverArgs.push("--codex");
  if (args.includes("--write")) serverArgs.push("--write");
  if (args.includes("--no-listen")) serverArgs.push("--no-listen");

  const port = parseFlagValue(args, "--port");
  const host = parseFlagValue(args, "--host");
  const token = parseFlagValue(args, "--token");

  const envVars = {
    WEIXIN_BRIDGE_STATE: stateDir,
    WEIXIN_API_PORT: port,
    WEIXIN_API_HOST: host,
    WEIXIN_API_TOKEN: token,
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
  };

  await fs.writeFile(plistPath, plist(serverArgs, envVars), "utf8");
  console.log(`Installed ${plistPath}`);
  console.log(`Server flags: ${serverArgs.join(" ") || "(默认)"}`);
  console.log(`Env: WEIXIN_API_HOST=${host || "127.0.0.1"} WEIXIN_API_PORT=${port || 8787} WEIXIN_API_TOKEN=${token ? "<set>" : "<none>"}`);
  await start();
}

async function start() {
  run("launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath], { allowFailure: true });
  run("launchctl", ["kickstart", "-k", `gui/${process.getuid()}/${label}`], { allowFailure: true });
  console.log("Started weixin bridge service.");
}

async function stop() {
  run("launchctl", ["bootout", `gui/${process.getuid()}/${label}`], { allowFailure: true });
  console.log("Stopped weixin bridge service.");
}

async function restart() {
  await stop();
  await start();
}

async function status() {
  const result = run("launchctl", ["print", `gui/${process.getuid()}/${label}`], { allowFailure: true });
  if (result.status === 0) {
    console.log(result.stdout.trim());
  } else {
    console.log("Service is not loaded.");
  }
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
