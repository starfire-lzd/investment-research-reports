#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import qrcode from "qrcode-terminal";

const root = process.cwd();
const stateDir = process.env.WEIXIN_BRIDGE_STATE || path.join(root, ".weixin-bridge");
const accountFile = path.join(stateDir, "account.json");
const syncFile = path.join(stateDir, "sync.json");
const contextFile = path.join(stateDir, "context-tokens.json");
const inboxDir = path.join(stateDir, "inbox");
const logFile = path.join(stateDir, "bridge.log");

const apiBaseUrl = "https://ilinkai.weixin.qq.com";
const defaultBotType = "3";
const channelVersion = "2.4.3";
const appId = "bot";
const appClientVersion = String((2 << 16) | (4 << 8) | 3);

// Keep these aligned with @tencent-weixin/openclaw-weixin/src/monitor/monitor.ts.
const defaultLongPollTimeoutMs = 35_000;
const maxConsecutiveFailures = 3;
const backoffDelayMs = 30_000;
const retryDelayMs = 2_000;

function usage() {
  console.log(`Usage:
  node scripts/weixin-bridge.mjs login
  node scripts/weixin-bridge.mjs import-openclaw
  node scripts/weixin-bridge.mjs status
  node scripts/weixin-bridge.mjs listen [--codex] [--write] [--once]
  node scripts/weixin-bridge.mjs send --message "text" [--to user@im.wechat]

Notes:
  - Default listen mode is local command mode.
  - --codex routes inbound messages to codex exec in read-only sandbox.
  - --write changes Codex sandbox to workspace-write.`);
}

async function ensureState() {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(inboxDir, { recursive: true });
}

async function log(line) {
  await ensureState();
  await fs.appendFile(logFile, `${new Date().toISOString()} ${line}\n`);
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function baseInfo() {
  return {
    channel_version: channelVersion,
    bot_agent: "CodexWeixinBridge/0.1.0",
  };
}

function commonHeaders(withToken) {
  const headers = {
    "Content-Type": "application/json",
    "iLink-App-Id": appId,
    "iLink-App-ClientVersion": appClientVersion,
    "X-WECHAT-UIN": randomWechatUin(),
  };
  if (withToken) {
    headers.AuthorizationType = "ilink_bot_token";
    headers.Authorization = `Bearer ${withToken}`;
  }
  return headers;
}

async function postJson(endpoint, body, opts = {}) {
  const controller = opts.timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const res = await fetch(new URL(endpoint, `${opts.baseUrl || apiBaseUrl}/`), {
      method: "POST",
      headers: commonHeaders(opts.token),
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getJson(endpoint, opts = {}) {
  const controller = opts.timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const res = await fetch(new URL(endpoint, `${opts.baseUrl || apiBaseUrl}/`), {
      method: "GET",
      headers: {
        "iLink-App-Id": appId,
        "iLink-App-ClientVersion": appClientVersion,
      },
      signal: controller?.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  try {
    await fs.chmod(file, mode);
  } catch {
    // best effort
  }
}

function normalizeAccountId(raw) {
  return raw.replace("@", "-").replace(".", "-");
}

async function loadAccount() {
  const local = await readJson(accountFile, null);
  if (local?.token) return local;

  const legacyRoot = path.join(os.homedir(), ".openclaw", "openclaw-weixin");
  const index = await readJson(path.join(legacyRoot, "accounts.json"), []);
  const id = index.at(-1);
  if (!id) return null;
  const legacy = await readJson(path.join(legacyRoot, "accounts", `${id}.json`), null);
  if (!legacy?.token) return null;
  return {
    accountId: id,
    token: legacy.token,
    baseUrl: legacy.baseUrl || apiBaseUrl,
    userId: legacy.userId,
    savedAt: legacy.savedAt,
    importedFrom: "openclaw",
  };
}

async function importOpenClaw() {
  await ensureState();
  const account = await loadAccount();
  if (!account?.token) {
    throw new Error("未找到可导入的 OpenClaw 微信登录凭据，请先运行 login。");
  }
  await writeJson(accountFile, account);

  const legacyRoot = path.join(os.homedir(), ".openclaw", "openclaw-weixin", "accounts");
  for (const [legacyName, target] of [
    [`${account.accountId}.sync.json`, syncFile],
    [`${account.accountId}.context-tokens.json`, contextFile],
  ]) {
    const source = path.join(legacyRoot, legacyName);
    if (fsSync.existsSync(source)) {
      await fs.copyFile(source, target);
      await fs.chmod(target, 0o600).catch(() => {});
    }
  }

  console.log(`已导入微信账号：${account.accountId}`);
  if (account.userId) console.log(`最近扫码用户：${account.userId}`);
}

async function login() {
  await ensureState();
  const qr = await postJson(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(defaultBotType)}`, {
    local_token_list: [],
  });
  if (!qr.qrcode || !qr.qrcode_img_content) {
    throw new Error(`二维码响应异常：${JSON.stringify(qr)}`);
  }

  console.log("请用手机微信扫描二维码：");
  qrcode.generate(qr.qrcode_img_content, { small: true });
  console.log(qr.qrcode_img_content);

  const start = Date.now();
  let baseUrl = apiBaseUrl;
  while (Date.now() - start < 5 * 60_000) {
    const status = await getJson(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr.qrcode)}`, {
      baseUrl,
      timeoutMs: 35_000,
    }).catch((err) => {
      if (err.name === "AbortError") return { status: "wait" };
      throw err;
    });
    if (status.status === "scaned") {
      console.log("已扫码，等待手机确认...");
      continue;
    }
    if (status.status === "scaned_but_redirect" && status.redirect_host) {
      baseUrl = status.redirect_host.startsWith("http") ? status.redirect_host : `https://${status.redirect_host}`;
      console.log(`切换到重定向节点：${baseUrl}`);
      continue;
    }
    if (status.status === "confirmed" || status.bot_token) {
      const accountId = normalizeAccountId(status.ilink_bot_id || "default@im.bot");
      const account = {
        accountId,
        token: status.bot_token,
        baseUrl: status.baseurl || baseUrl,
        userId: status.ilink_user_id,
        savedAt: new Date().toISOString(),
      };
      await writeJson(accountFile, account);
      console.log(`登录成功：${accountId}`);
      if (account.userId) console.log(`扫码用户：${account.userId}`);
      return;
    }
    if (status.status === "expired") throw new Error("二维码已过期。");
    await sleep(1200);
  }
  throw new Error("等待扫码超时。");
}

function textFromItems(items = []) {
  for (const item of items) {
    if (item.type === 1 && item.text_item?.text != null) return String(item.text_item.text);
    if (item.voice_item?.text) return String(item.voice_item.text);
  }
  return "";
}

async function getContextTokens() {
  return await readJson(contextFile, {});
}

async function setContextToken(userId, token) {
  if (!userId || !token) return;
  const tokens = await getContextTokens();
  tokens[userId] = token;
  await writeJson(contextFile, tokens);
}

async function getUpdates(account, timeoutMs = defaultLongPollTimeoutMs) {
  const sync = await readJson(syncFile, { get_updates_buf: "" });
  let resp;
  try {
    resp = await postJson("ilink/bot/getupdates", {
      get_updates_buf: sync.get_updates_buf || "",
      base_info: baseInfo(),
    }, {
      baseUrl: account.baseUrl,
      token: account.token,
      timeoutMs,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return { messages: [], nextTimeoutMs: timeoutMs };
    }
    throw err;
  }
  if (resp.get_updates_buf) await writeJson(syncFile, { get_updates_buf: resp.get_updates_buf });
  return {
    messages: resp.msgs || [],
    nextTimeoutMs:
      Number.isFinite(resp.longpolling_timeout_ms) && resp.longpolling_timeout_ms > 0
        ? resp.longpolling_timeout_ms
        : timeoutMs,
  };
}

async function sendMessage({ to, message }) {
  const account = await loadAccount();
  if (!account?.token) throw new Error("微信未登录。请先运行 npm run weixin:login 或 npm run weixin:import-openclaw。");
  const target = to || account.userId;
  if (!target) throw new Error("缺少目标 userId。请使用 --to <user@im.wechat>。");
  const tokens = await getContextTokens();
  const contextToken = tokens[target];
  const clientId = `codex-weixin-${crypto.randomUUID()}`;
  await postJson("ilink/bot/sendmessage", {
    msg: {
      from_user_id: "",
      to_user_id: target,
      client_id: clientId,
      message_type: 1,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text: message } }],
      context_token: contextToken,
    },
    base_info: baseInfo(),
  }, {
    baseUrl: account.baseUrl,
    token: account.token,
    timeoutMs: 15_000,
  });
  console.log(`sent ${clientId} -> ${target}`);
}

async function writeInbox(message) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(inboxDir, `${stamp}-${message.from}.json`);
  await writeJson(file, message, 0o600);
  return file;
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
  await new Promise((resolve, reject) => {
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
  await ensureState();
  const account = await loadAccount();
  if (!account?.token) throw new Error("微信未登录。请先运行 login 或 import-openclaw。");
  await writeJson(accountFile, account);
  console.log(`listening account=${account.accountId} baseUrl=${account.baseUrl}`);
  await log(`listen start account=${account.accountId} codex=${opts.codex} write=${opts.write}`);

  let nextTimeoutMs = defaultLongPollTimeoutMs;
  let consecutiveFailures = 0;

  while (true) {
    let messages = [];
    try {
      const result = await getUpdates(account, nextTimeoutMs);
      messages = result.messages;
      nextTimeoutMs = result.nextTimeoutMs;
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      const summary = String(err).slice(0, 800);
      console.error(`getUpdates failed (${consecutiveFailures}/${maxConsecutiveFailures}): ${summary}`);
      await log(`getUpdates failed count=${consecutiveFailures} err=${summary}`);
      if (consecutiveFailures >= maxConsecutiveFailures) {
        consecutiveFailures = 0;
        await log(`getUpdates backoff ${backoffDelayMs}ms`);
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
      if (msg.context_token) await setContextToken(from, msg.context_token);
      const saved = await writeInbox({ from, text, raw: msg, receivedAt: new Date().toISOString() });
      console.log(`inbound ${from}: ${text}`);
      await log(`inbound from=${from} file=${saved}`);

      let reply;
      try {
        reply = opts.codex ? await runCodex(text, opts) : localCommandReply(text);
      } catch (err) {
        reply = `处理失败：${String(err).slice(0, 800)}`;
      }
      if (reply) await sendMessage({ to: from, message: reply.slice(0, 3500) });
    }
    if (opts.once) break;
  }
}

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (!cmd || cmd === "help" || cmd === "--help") return usage();
    if (cmd === "login") return await login();
    if (cmd === "import-openclaw") return await importOpenClaw();
    if (cmd === "status") {
      const account = await loadAccount();
      console.log({
        stateDir,
        hasAccount: Boolean(account?.token),
        accountId: account?.accountId,
        userId: account?.userId,
        baseUrl: account?.baseUrl,
      });
      return;
    }
    if (cmd === "send") {
      const message = argValue(args, "--message") || args.join(" ").trim();
      const to = argValue(args, "--to");
      if (!message) throw new Error("缺少消息内容。");
      return await sendMessage({ to, message });
    }
    if (cmd === "listen") {
      return await listen({
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

await main();
