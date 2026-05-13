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
const bridgePath = path.join(root, "scripts", "weixin-bridge.mjs");

function usage() {
  console.log(`Usage:
  node scripts/weixin-service.mjs install [--codex] [--write]
  node scripts/weixin-service.mjs start
  node scripts/weixin-service.mjs stop
  node scripts/weixin-service.mjs restart
  node scripts/weixin-service.mjs status
  node scripts/weixin-service.mjs uninstall`);
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

function plist(args) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${[nodePath, bridgePath, "listen", ...args].map(stringEntry).join("\n")}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>WEIXIN_BRIDGE_STATE</key>
    <string>${xmlEscape(stateDir)}</string>
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

async function install(args) {
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
  const serviceArgs = [];
  if (args.includes("--codex")) serviceArgs.push("--codex");
  if (args.includes("--write")) serviceArgs.push("--write");
  await fs.writeFile(plistPath, plist(serviceArgs), "utf8");
  console.log(`Installed ${plistPath}`);
  console.log(`Mode: listen ${serviceArgs.join(" ") || "(local command mode)"}`);
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

