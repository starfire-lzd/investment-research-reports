#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  DEFAULT_ILINK_BOT_TYPE,
  displayQRCode,
  startWeixinLoginWithQr,
  waitForWeixinLogin,
} from "@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js";

import {
  apiBaseUrl,
  defaultLongPollTimeoutMs,
  maxConsecutiveFailures,
  backoffDelayMs,
  retryDelayMs,
  appendLog,
  ensureState,
  getAccountPaths,
  getPaths,
  getStateDir,
  getUpdates,
  loadDefaultAccount,
  normalizeAccountAlias,
  normalizeAccountId,
  projectRoot,
  resolveAccount,
  saveAccount,
  sendMessage,
  setContextToken,
  sleep,
  textFromItems,
  writeInbox,
  writeJson,
} from "./weixin-core.js";

const root = projectRoot;
const stateDir = getStateDir(root);
const paths = getPaths(stateDir);

function usage() {
  console.log(`Usage:
  node dist/index.js login --alias ACCOUNT_ALIAS [--default]
  node dist/index.js import-openclaw --alias ACCOUNT_ALIAS [--default]
  node dist/index.js status
  node dist/index.js listen [--account ACCOUNT_ALIAS|default] [--codex] [--write] [--once]

Notes:
  - Default listen mode is local command mode.
  - --codex routes inbound messages to codex exec in read-only sandbox.
  - --write changes Codex sandbox to workspace-write.
  - 发送消息仅支持 HTTP API（node dist/index.js server）。`);
}

function argValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

function syncStandaloneEnv() {
  process.env.WEIXIN_BRIDGE_STATE = stateDir;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.CLAWDBOT_STATE_DIR = stateDir;
}

async function login(args = []) {
  await ensureState(stateDir);
  syncStandaloneEnv();
  const alias = normalizeAccountAlias(argValue(args, "--alias"));
  if (!alias) {
    throw new Error("login 必须传入 --alias，例如：npm run login -- --alias research-bot --default");
  }
  const botType = argValue(args, "--bot-type") || DEFAULT_ILINK_BOT_TYPE;
  const started = await startWeixinLoginWithQr({
    apiBaseUrl,
    botType,
  });
  if (!started?.qrcodeUrl || !started?.sessionKey) {
    throw new Error(`二维码响应异常：${started?.message || "未返回二维码"}`);
  }
  console.log("请用手机微信扫描二维码：");
  await displayQRCode(started.qrcodeUrl);
  const result = await waitForWeixinLogin({
    sessionKey: started.sessionKey,
    apiBaseUrl,
    botType,
    timeoutMs: 5 * 60_000,
  });
  if (result.alreadyConnected) {
    console.log(result.message);
    return;
  }
  if (!result.connected || !result.botToken) {
    throw new Error(result.message || "等待扫码超时。");
  }
  const accountId = normalizeAccountId(result.accountId || "default@im.bot");
  const account = {
    accountId,
    alias,
    name: argValue(args, "--account-name"),
    token: result.botToken,
    baseUrl: result.baseUrl || apiBaseUrl,
    userId: result.userId,
    savedAt: new Date().toISOString(),
  };
  const makeDefault = args.includes("--default");
  await saveAccount(stateDir, account, { makeDefault });
  console.log(`登录成功：${accountId}`);
  console.log(`别名：${alias}`);
  console.log(`默认账号：${makeDefault ? "是" : "否"}`);
  if (account.name) console.log(`账号名：${account.name}`);
  if (account.userId) console.log(`扫码用户：${account.userId}`);
}

async function importOpenClaw(args = []) {
  await ensureState(stateDir);
  const alias = normalizeAccountAlias(argValue(args, "--alias"));
  if (!alias) {
    throw new Error("import-openclaw 必须传入 --alias，例如：npm run import-openclaw -- --alias research-bot --default");
  }
  const account = await loadDefaultAccount(stateDir);
  if (!account?.token) {
    throw new Error("未找到可导入的 OpenClaw 微信登录凭据，请先运行 login。");
  }
  const nextAccount = { ...account, alias };
  const makeDefault = args.includes("--default");
  await saveAccount(stateDir, nextAccount, { makeDefault });

  const legacyRoot = path.join(os.homedir(), ".openclaw", "openclaw-weixin", "accounts");
  const accountPaths = getAccountPaths(stateDir, account.accountId);
  for (const [legacyName, target] of [
    [`${account.accountId}.sync.json`, accountPaths.syncFile],
    [`${account.accountId}.context-tokens.json`, accountPaths.contextFile],
  ]) {
    const source = path.join(legacyRoot, legacyName);
    if (fsSync.existsSync(source)) {
      await fs.copyFile(source, target);
      await fs.chmod(target, 0o600).catch(() => {});
    }
  }

  console.log(`已导入微信账号：${account.accountId}`);
  console.log(`别名：${alias}`);
  console.log(`默认账号：${makeDefault ? "是" : "否"}`);
  if (account.userId) console.log(`最近扫码用户：${account.userId}`);
}

function localCommandReply(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "帮助" || trimmed.toLowerCase() === "help") {
    return [
      "可用命令：",
      "1. 网站：返回投研网站链接",
      "2. 状态：返回桥接状态",
      "3. 今日：返回今日文件列表",
      "其他消息会被保存到本地 inbox。启动 listen --codex 后会转给 Codex。"
    ].join("\n");
  }
  if (trimmed.includes("网站")) {
    return "投研网站：https://starfire-lzd.github.io/investment-research-reports/";
  }
  if (trimmed.includes("状态")) {
    return "微信桥接运行中。默认模式只处理本地命令；如需转给 Codex，请用 npm run weixin:listen -- --codex。";
  }
  if (trimmed.includes("今日")) {
    const today = new Date().toISOString().slice(0, 10);
    const dir = path.join(root, today);
    if (!fsSync.existsSync(dir)) return `今日目录不存在：${today}`;
    return fsSync.readdirSync(dir).join("\n") || `今日目录为空：${today}`;
  }
  return "已收到并保存到本地 inbox。发送“帮助”查看可用命令。";
}

async function runCodex(text, opts) {
  const prompt = [
    "你是投研项目的本地 Codex 助手。用户通过微信发来消息。",
    "请简洁回答。除非用户明确要求修改文件，否则只做分析和说明。",
    `微信消息：${text}`,
  ].join("\n\n");
  const outFile = path.join(stateDir, "last-codex-reply.txt");
  await new Promise<void>((resolve, reject) => {
    const args = [
      "exec",
      "-C", root,
      "-s", opts.write ? "workspace-write" : "read-only",
      "-a", "never",
      "-o", outFile,
      prompt,
    ];
    const child = spawn("codex", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`codex exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
  return (await fs.readFile(outFile, "utf8")).trim();
}

async function listen(opts) {
  await ensureState(stateDir);
  syncStandaloneEnv();
  const account = await resolveAccount(stateDir, opts.accountId);
  await writeJson(paths.accountFile, account);
  console.log(`standalone listen account=${account.accountId} baseUrl=${account.baseUrl}`);
  await appendLog(stateDir, `listen start account=${account.accountId} codex=${opts.codex} write=${opts.write}`);

  let nextTimeoutMs = defaultLongPollTimeoutMs;
  let consecutiveFailures = 0;

  while (true) {
    let messages = [];
    try {
      const result = await getUpdates(stateDir, account, nextTimeoutMs);
      messages = result.messages;
      nextTimeoutMs = result.nextTimeoutMs;
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      const summary = String(err).slice(0, 800);
      console.error(`getUpdates failed (${consecutiveFailures}/${maxConsecutiveFailures}): ${summary}`);
      await appendLog(stateDir, `getUpdates failed count=${consecutiveFailures} err=${summary}`);
      if (consecutiveFailures >= maxConsecutiveFailures) {
        consecutiveFailures = 0;
        await appendLog(stateDir, `getUpdates backoff ${backoffDelayMs}ms`);
        await sleep(backoffDelayMs);
      } else {
        await sleep(retryDelayMs);
      }
      if (opts.once) break;
      continue;
    }

    for (const msg of messages) {
      const from = msg.from_user_id || "";
      const text = textFromItems(msg.item_list);
      if (!from || !text) continue;
      if (msg.context_token) await setContextToken(stateDir, from, msg.context_token, account);
      const saved = await writeInbox(stateDir, { from, text, raw: msg, receivedAt: new Date().toISOString() });
      console.log(`inbound ${from}: ${text}`);
      await appendLog(stateDir, `inbound from=${from} file=${saved}`);

      let reply;
      try {
        reply = opts.codex ? await runCodex(text, opts) : localCommandReply(text);
      } catch (err) {
        reply = `处理失败：${String(err).slice(0, 800)}`;
      }
      if (reply) {
        await sendMessage({ stateDir, account, to: from, message: reply.slice(0, 3500) });
      }
    }
    if (opts.once) break;
  }
}

export async function mainBridge(argv = process.argv.slice(2)) {
  const [cmd, ...args] = argv;
  try {
    if (!cmd || cmd === "help" || cmd === "--help") return usage();
    if (cmd === "login") return await login(args);
    if (cmd === "import-openclaw") return await importOpenClaw(args);
    if (cmd === "status") {
      const account = await loadDefaultAccount(stateDir);
      console.log({
        stateDir,
        hasAccount: Boolean(account?.token),
        accountId: account?.accountId,
        alias: account?.alias,
        userId: account?.userId,
        baseUrl: account?.baseUrl,
      });
      return;
    }
    if (cmd === "send" || cmd === "send-media") {
      throw new Error("CLI 发送已禁用，请改用 HTTP API：POST /send、/send/markdown、/send/batch、/send/media");
    }
    if (cmd === "listen") {
      return await listen({
        accountId: argValue(args, "--account"),
        codex: args.includes("--codex"),
        write: args.includes("--write"),
        once: args.includes("--once"),
      });
    }
    throw new Error(`未知命令：${cmd}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
