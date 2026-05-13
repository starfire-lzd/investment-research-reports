#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  appendLog,
  backoffDelayMs,
  defaultLongPollTimeoutMs,
  ensureState,
  getContextTokens,
  getPaths,
  getStateDir,
  getUpdates,
  listAccounts,
  listInbox,
  maxConsecutiveFailures,
  resolveAccount,
  retryDelayMs,
  sendMediaMessage,
  sendMessage,
  setContextToken,
  sleep,
  textFromItems,
  writeInbox,
  writeJson,
} from "./weixin-core.mjs";

const root = process.cwd();
const stateDir = getStateDir(root);
const paths = getPaths(stateDir);

const port = Number(process.env.WEIXIN_API_PORT || 8787);
const host = process.env.WEIXIN_API_HOST || "127.0.0.1";
const apiToken = process.env.WEIXIN_API_TOKEN || ""; // 可选；非空时强制鉴权

function usage() {
  console.log(`Usage:
  node scripts/weixin-server.mjs [--no-listen] [--codex] [--write]

Env:
  WEIXIN_API_PORT   监听端口，默认 8787
  WEIXIN_API_HOST   绑定地址，默认 127.0.0.1
  WEIXIN_API_TOKEN  非空时，所有请求必须带 Authorization: Bearer <token>
  WEIXIN_BRIDGE_STATE  状态目录，默认 <cwd>/.weixin-bridge

Endpoints:
  GET  /health
  GET  /status
  GET  /accounts
  GET  /contacts
  GET  /inbox?limit=50&since=ISO
  POST /send         body: { to?, message, account? }
  POST /send/markdown body: { to?, message, account? }
  POST /send/batch   body: { messages: [{ to?, message, account? }] }
  POST /send/media   body: { to?, message?, mediaUrl|filePath, account?, markdown? }`);
}

const startedAt = new Date().toISOString();
const runtime = {
  listenEnabled: true,
  codex: false,
  write: false,
  listenState: "idle",
  lastListenError: null,
  inboundCount: 0,
  outboundCount: 0,
  sendErrorCount: 0,
  lastSendError: null,
  accounts: {},
};

function authorized(req) {
  if (!apiToken) return true;
  const header = req.headers["authorization"] || "";
  if (header === `Bearer ${apiToken}`) return true;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return url.searchParams.get("token") === apiToken;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function sendError(res, status, message, extra = {}) {
  sendJson(res, status, { ok: false, error: message, ...extra });
}

async function readBody(req, { maxBytes = 1 << 20 } = {}) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`body too large (>${maxBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function publicAccount(a) {
  if (!a) return null;
  return {
    accountId: a.accountId,
    name: a.name,
    userId: a.userId,
    baseUrl: a.baseUrl,
    savedAt: a.savedAt,
    source: a._source,
  };
}

async function handleStatus(_req, res) {
  const accounts = await listAccounts(stateDir).catch(() => []);
  sendJson(res, 200, {
    ok: true,
    startedAt,
    runtime,
    stateDir,
    accountCount: accounts.length,
    defaultAccount: publicAccount(accounts[0]),
  });
}

async function handleAccounts(_req, res) {
  const accounts = await listAccounts(stateDir);
  sendJson(res, 200, {
    ok: true,
    accounts: accounts.map(publicAccount),
  });
}

async function handleContacts(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);
  const accountId = url.searchParams.get("account") || undefined;
  const account = accountId ? await resolveAccount(stateDir, accountId) : undefined;
  const tokens = await getContextTokens(stateDir, account);
  const contacts = Object.entries(tokens)
    .slice(0, limit)
    .map(([userId, contextToken]) => ({ userId, hasContextToken: Boolean(contextToken) }));
  sendJson(res, 200, { ok: true, count: contacts.length, contacts });
}

async function handleInbox(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
  const since = url.searchParams.get("since") || undefined;
  const messages = await listInbox(stateDir, { limit, since });
  sendJson(res, 200, {
    ok: true,
    count: messages.length,
    messages: messages.map((m) => ({
      account: m.account,
      from: m.from,
      text: m.text,
      receivedAt: m.receivedAt,
      messageId: m.raw?.message_id,
    })),
  });
}

async function doSend({ to, message, account: accountId, markdown = false }) {
  if (typeof message !== "string" || !message.trim()) {
    throw Object.assign(new Error("message 必须为非空字符串"), { statusCode: 400 });
  }
  if (message.length > 3500) {
    throw Object.assign(new Error("message 超长（>3500 字符）"), { statusCode: 400 });
  }
  let account;
  try {
    account = await resolveAccount(stateDir, accountId);
  } catch (err) {
    throw Object.assign(new Error(err.message), { statusCode: 404 });
  }
  const result = await sendMessage({ stateDir, account, to, message, markdown });
  runtime.outboundCount += 1;
  await appendLog(stateDir, `http send to=${result.to} clientId=${result.clientId} hasCtx=${result.hasContextToken}`);
  return { ...result, account: account.accountId };
}

async function doSendMedia({ to, message = "", mediaUrl, filePath, account: accountId, markdown = false }) {
  let account;
  try {
    account = await resolveAccount(stateDir, accountId);
  } catch (err) {
    throw Object.assign(new Error(err.message), { statusCode: 404 });
  }
  const result = await sendMediaMessage({ stateDir, account, to, message, mediaUrl, filePath, markdown });
  runtime.outboundCount += 1;
  await appendLog(stateDir, `http send-media to=${result.to} clientId=${result.clientId} type=${result.mediaType} hasCtx=${result.hasContextToken}`);
  return { ...result, account: account.accountId };
}

async function handleSend(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }
  try {
    const result = await doSend(body);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    runtime.sendErrorCount += 1;
    runtime.lastSendError = { message: String(err.message || err), at: new Date().toISOString() };
    sendError(res, err.statusCode || 500, String(err.message || err));
  }
}

async function handleSendMarkdown(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }
  try {
    const result = await doSend({ ...body, markdown: true });
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    runtime.sendErrorCount += 1;
    runtime.lastSendError = { message: String(err.message || err), at: new Date().toISOString() };
    sendError(res, err.statusCode || 500, String(err.message || err));
  }
}

async function handleSendBatch(req, res) {
  let body;
  try {
    body = await readBody(req, { maxBytes: 1 << 22 });
  } catch (err) {
    return sendError(res, 400, err.message);
  }
  const list = Array.isArray(body?.messages) ? body.messages : null;
  if (!list || !list.length) return sendError(res, 400, "messages 必须为非空数组");
  if (list.length > 50) return sendError(res, 400, "单次 batch 最多 50 条");
  const intervalMs = Math.max(Number(body.intervalMs) || 1200, 600);
  const results = [];
  for (const item of list) {
    try {
      results.push({ ok: true, ...(await doSend(item)) });
    } catch (err) {
      runtime.sendErrorCount += 1;
      runtime.lastSendError = { message: String(err.message || err), at: new Date().toISOString() };
      results.push({ ok: false, to: item?.to, error: String(err.message || err) });
    }
    if (results.length < list.length) await sleep(intervalMs);
  }
  sendJson(res, 200, { ok: results.every((r) => r.ok), count: results.length, results });
}

async function handleSendMedia(req, res) {
  let body;
  try {
    body = await readBody(req, { maxBytes: 1 << 22 });
  } catch (err) {
    return sendError(res, 400, err.message);
  }
  try {
    if (!body?.mediaUrl && !body?.filePath) {
      return sendError(res, 400, "mediaUrl 或 filePath 必填");
    }
    const result = await doSendMedia(body);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    runtime.sendErrorCount += 1;
    runtime.lastSendError = { message: String(err.message || err), at: new Date().toISOString() };
    sendError(res, err.statusCode || 500, String(err.message || err));
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, startedAt });
  }

  if (!authorized(req)) {
    return sendError(res, 401, "unauthorized: 设置环境变量 WEIXIN_API_TOKEN 后需要 Bearer token");
  }

  if (pathname === "/status" && req.method === "GET") return await handleStatus(req, res);
  if (pathname === "/accounts" && req.method === "GET") return await handleAccounts(req, res);
  if (pathname === "/contacts" && req.method === "GET") return await handleContacts(req, res);
  if (pathname === "/inbox" && req.method === "GET") return await handleInbox(req, res);
  if (pathname === "/send" && req.method === "POST") return await handleSend(req, res);
  if (pathname === "/send/markdown" && req.method === "POST") return await handleSendMarkdown(req, res);
  if (pathname === "/send/batch" && req.method === "POST") return await handleSendBatch(req, res);
  if (pathname === "/send/media" && req.method === "POST") return await handleSendMedia(req, res);

  sendError(res, 404, `not found: ${req.method} ${pathname}`);
}

async function startHttpServer() {
  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(`unhandled ${req.method} ${req.url}: ${err}`);
      sendError(res, 500, String(err.message || err));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const tokenHint = apiToken ? "with API token (Bearer required)" : "no API token (open on bind interface)";
  console.log(`weixin HTTP server listening on http://${host}:${port} (${tokenHint})`);
  await appendLog(stateDir, `http server start host=${host} port=${port} token=${apiToken ? "yes" : "no"}`);
  return server;
}

function localCommandReply(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "帮助" || trimmed.toLowerCase() === "help") {
    return [
      "可用命令：",
      "1. 网站：返回投研网站链接",
      "2. 状态：返回桥接状态",
      "其他消息会被保存到 inbox。",
    ].join("\n");
  }
  if (trimmed.includes("网站")) {
    return "投研网站：https://starfire-lzd.github.io/investment-research-reports/";
  }
  if (trimmed.includes("状态")) {
    return `HTTP 桥接运行中，端口 ${port}。`;
  }
  return "已收到。发送“帮助”查看可用命令。";
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

async function listenAccountLoop(account, opts) {
  runtime.accounts[account.accountId] = {
    listenState: "idle",
    inboundCount: 0,
    lastListenError: null,
  };
  console.log(`listen loop start account=${account.accountId} codex=${opts.codex} write=${opts.write}`);
  await appendLog(stateDir, `listen start account=${account.accountId} codex=${opts.codex}`);

  let nextTimeoutMs = defaultLongPollTimeoutMs;
  let consecutiveFailures = 0;

  while (true) {
    runtime.listenState = "polling";
    runtime.accounts[account.accountId].listenState = "polling";
    let messages = [];
    try {
      const result = await getUpdates(stateDir, account, nextTimeoutMs);
      messages = result.messages;
      nextTimeoutMs = result.nextTimeoutMs;
      consecutiveFailures = 0;
      runtime.lastListenError = null;
      runtime.accounts[account.accountId].lastListenError = null;
    } catch (err) {
      consecutiveFailures += 1;
      runtime.lastListenError = { message: String(err).slice(0, 800), at: new Date().toISOString() };
      runtime.accounts[account.accountId].lastListenError = runtime.lastListenError;
      console.error(`getUpdates failed (${consecutiveFailures}/${maxConsecutiveFailures}): ${err}`);
      await appendLog(stateDir, `getUpdates failed count=${consecutiveFailures} err=${runtime.lastListenError.message}`);
      runtime.listenState = "backoff";
      runtime.accounts[account.accountId].listenState = "backoff";
      if (consecutiveFailures >= maxConsecutiveFailures) {
        consecutiveFailures = 0;
        await sleep(backoffDelayMs);
      } else {
        await sleep(retryDelayMs);
      }
      continue;
    }

    for (const msg of messages) {
      const from = msg.from_user_id || "";
      const text = textFromItems(msg.item_list);
      if (!from || !text) continue;
      if (msg.context_token) await setContextToken(stateDir, from, msg.context_token, account);
      const saved = await writeInbox(stateDir, { account: account.accountId, from, text, raw: msg, receivedAt: new Date().toISOString() });
      runtime.inboundCount += 1;
      runtime.accounts[account.accountId].inboundCount += 1;
      console.log(`inbound ${from}: ${text}`);
      await appendLog(stateDir, `inbound from=${from} file=${saved}`);

      // 默认 listen 模式只收，不自动回复，避免和 HTTP 主动发送混叠
      if (!opts.autoReply) continue;
      let reply;
      try {
        reply = opts.codex ? await runCodex(text, opts) : localCommandReply(text);
      } catch (err) {
        reply = `处理失败：${String(err).slice(0, 800)}`;
      }
      if (reply) {
        try {
          await sendMessage({ stateDir, account, to: from, message: reply.slice(0, 3500) });
          runtime.outboundCount += 1;
        } catch (err) {
          runtime.sendErrorCount += 1;
          runtime.lastSendError = { message: String(err.message || err), at: new Date().toISOString() };
        }
      }
    }
  }
}

async function startListenLoop(opts) {
  await ensureState(stateDir);
  const accounts = await listAccounts(stateDir);
  if (!accounts.length) {
    const account = await resolveAccount(stateDir);
    await listenAccountLoop(account, opts);
    return;
  }
  await writeJson(paths.accountFile, accounts[0]);
  for (const account of accounts) {
    listenAccountLoop(account, opts).catch(async (err) => {
      runtime.accounts[account.accountId] = runtime.accounts[account.accountId] || {};
      runtime.accounts[account.accountId].listenState = "crashed";
      runtime.accounts[account.accountId].lastListenError = { message: String(err).slice(0, 800), at: new Date().toISOString() };
      await appendLog(stateDir, `listen loop crashed account=${account.accountId} err=${String(err).slice(0, 800)}`);
      process.exit(1);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return usage();

  runtime.listenEnabled = !args.includes("--no-listen");
  runtime.codex = args.includes("--codex");
  runtime.write = args.includes("--write");
  const autoReply = args.includes("--auto-reply") || runtime.codex;

  await ensureState(stateDir);
  await startHttpServer();

  if (runtime.listenEnabled) {
    startListenLoop({ codex: runtime.codex, write: runtime.write, autoReply }).catch(async (err) => {
      console.error("listen loop crashed:", err);
      await appendLog(stateDir, `listen loop crashed err=${String(err).slice(0, 800)}`);
      process.exit(1);
    });
  } else {
    console.log("listen loop disabled (--no-listen); inbound messages will NOT be collected.");
  }
}

await main();
