import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { getUpdates as getOfficialUpdates } from "@tencent-weixin/openclaw-weixin/dist/src/api/api.js";
import {
  uploadFileAttachmentToWeixin,
  uploadFileToWeixin,
  uploadVideoToWeixin,
} from "@tencent-weixin/openclaw-weixin/dist/src/cdn/upload.js";
import { generateId } from "@tencent-weixin/openclaw-weixin/dist/src/util/random.js";
import { StreamingMarkdownFilter } from "@tencent-weixin/openclaw-weixin/dist/src/messaging/send.js";

export const apiBaseUrl = "https://ilinkai.weixin.qq.com";
export const channelVersion = "2.4.3";
export const appId = "bot";
export const appClientVersion = String((2 << 16) | (4 << 8) | 3);
export const defaultLongPollTimeoutMs = 35_000;
export const maxConsecutiveFailures = 3;
export const backoffDelayMs = 30_000;
export const retryDelayMs = 2_000;
export const defaultBotType = "3";
export const cdnBaseUrl = "https://novac2c.cdn.weixin.qq.com/c2c";
export const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const toolDir = path.resolve(srcDir, "..");
export const projectRoot = path.resolve(toolDir, "..", "..");

type RequestOptions = {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
};

export function getStateDir(_root = process.cwd()) {
  return process.env.WEIXIN_BRIDGE_STATE || path.join(toolDir, "state");
}

export function getPaths(stateDir) {
  return {
    stateDir,
    accountFile: path.join(stateDir, "account.json"),
    accountsDir: path.join(stateDir, "accounts"),
    syncFile: path.join(stateDir, "sync.json"),
    contextFile: path.join(stateDir, "context-tokens.json"),
    inboxDir: path.join(stateDir, "inbox"),
    logFile: path.join(stateDir, "bridge.log"),
  };
}

export function getAccountPaths(stateDir, accountId) {
  const safe = normalizeAccountId(accountId);
  const { accountsDir } = getPaths(stateDir);
  return {
    accountFile: path.join(accountsDir, `${safe}.json`),
    syncFile: path.join(accountsDir, `${safe}.sync.json`),
    contextFile: path.join(accountsDir, `${safe}.context-tokens.json`),
  };
}

function getInboxAliasDir(stateDir, alias) {
  const normalizedAlias = normalizeAccountAlias(alias);
  if (!normalizedAlias) {
    throw new Error("inbox 目录缺少 alias，必须传入 default 或已登录账号 alias");
  }
  return path.join(getPaths(stateDir).inboxDir, normalizedAlias);
}

async function resolveInboxAlias(stateDir, message) {
  const directAlias = normalizeAccountAlias(message?.alias);
  if (directAlias) return directAlias;
  const accountId = String(message?.accountId || message?.account || "").trim();
  if (!accountId) {
    throw new Error("writeInbox 缺少 alias/accountId，无法确定 inbox 目录");
  }
  const accounts = await listAccounts(stateDir);
  const hit = accounts.find((item) => item.accountId === accountId);
  const resolvedAlias = normalizeAccountAlias(hit?.alias);
  if (!resolvedAlias) {
    throw new Error(`writeInbox 未找到 accountId=${accountId} 对应的 alias`);
  }
  return resolvedAlias;
}

export async function ensureState(stateDir) {
  syncStandaloneEnv(stateDir);
  const p = getPaths(stateDir);
  await fs.mkdir(p.stateDir, { recursive: true });
  await fs.mkdir(p.inboxDir, { recursive: true });
}

export async function appendLog(stateDir, line) {
  await ensureState(stateDir);
  const { logFile } = getPaths(stateDir);
  await fs.appendFile(logFile, `${new Date().toISOString()} ${line}\n`);
}

function syncStandaloneEnv(stateDir) {
  // Force official helpers to use the bridge-local state dir instead of ~/.openclaw.
  process.env.WEIXIN_BRIDGE_STATE = stateDir;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.CLAWDBOT_STATE_DIR = stateDir;
}

export function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

export function baseInfo() {
  return {
    channel_version: channelVersion,
    bot_agent: "CodexWeixinBridge/0.2.0",
  };
}

function commonHeaders(token) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "iLink-App-Id": appId,
    "iLink-App-ClientVersion": appClientVersion,
    "X-WECHAT-UIN": randomWechatUin(),
  };
  if (token) {
    headers.AuthorizationType = "ilink_bot_token";
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function postJson(endpoint, body, opts: RequestOptions = {}) {
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

export async function getJson(endpoint, opts: RequestOptions = {}) {
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

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(file, value, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  try {
    await fs.chmod(file, mode);
  } catch {
    // best effort
  }
}

export function normalizeAccountId(raw) {
  return String(raw).replaceAll("@", "-").replaceAll(".", "-");
}

export function normalizeAccountAlias(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export async function loadDefaultAccount(stateDir) {
  const { accountFile } = getPaths(stateDir);
  const local = await readJson(accountFile, null);
  if (local?.token) return { ...local, _source: "default" };

  // Legacy fallback: import from OpenClaw
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
    _source: "legacy-openclaw",
  };
}

export async function listAccounts(stateDir) {
  const { accountFile, accountsDir } = getPaths(stateDir);
  const result = [];
  const def = await readJson(accountFile, null);
  if (def?.token) result.push({ ...def, _source: "default" });
  if (fsSync.existsSync(accountsDir)) {
    const files = await fs.readdir(accountsDir);
    for (const f of files) {
      if (!f.endsWith(".json") || f.endsWith(".sync.json") || f.endsWith(".context-tokens.json")) continue;
      const acc = await readJson(path.join(accountsDir, f), null);
      if (acc?.token) result.push({ ...acc, _source: f });
    }
  }
  const seen = new Set();
  return result.filter((a) => {
    if (!a.accountId || seen.has(a.accountId)) return false;
    seen.add(a.accountId);
    return true;
  });
}

export async function saveAccount(stateDir, account, { makeDefault = false } = {}) {
  if (!account?.accountId || !account?.token) throw new Error("accountId/token 不能为空");
  const alias = normalizeAccountAlias(account.alias);
  if (!alias) throw new Error("alias 不能为空，请在登录时通过 --alias 传入");
  const paths = getPaths(stateDir);
  const accounts = await listAccounts(stateDir);
  const duplicate = accounts.find((item) => item.accountId !== account.accountId && normalizeAccountAlias(item.alias) === alias);
  if (duplicate) {
    throw new Error(`alias=${alias} 已被占用（accountId=${duplicate.accountId}）`);
  }
  const accountPaths = getAccountPaths(stateDir, account.accountId);
  const nextAccount = { ...account, alias };
  await writeJson(accountPaths.accountFile, nextAccount);
  const def = await readJson(paths.accountFile, null);
  if (makeDefault || !def?.token) await writeJson(paths.accountFile, nextAccount);
}

export async function resolveAccount(stateDir, selector?) {
  const accounts = await listAccounts(stateDir);
  if (!accounts.length) {
    const legacy = await loadDefaultAccount(stateDir);
    if (legacy?.token) return legacy;
    throw new Error("微信未登录。请先运行 npm run weixin:login 或 npm run weixin:import-openclaw。");
  }
  const defaultAccount = accounts.find((a) => a._source === "default") || accounts[0];
  if (!selector || selector === "default") return defaultAccount;
  const alias = normalizeAccountAlias(selector);
  const hit = accounts.find((a) => normalizeAccountAlias(a.alias) === alias);
  if (!hit) {
    const available = accounts
      .map((a) => a.alias ? `${normalizeAccountAlias(a.alias)}${a._source === "default" ? " (default)" : ""}` : null)
      .filter(Boolean)
      .join(", ");
    throw new Error(`未找到 alias=${selector}。仅支持传 default 或已登录账号 alias（可用：${available || "无"}）`);
  }
  return hit;
}

export async function getContextTokens(stateDir, account) {
  const global = await readJson(getPaths(stateDir).contextFile, {});
  if (!account?.accountId) return global;
  const perAccount = await readJson(getAccountPaths(stateDir, account.accountId).contextFile, {});
  return { ...global, ...perAccount };
}

export async function setContextToken(stateDir, userId, token, account) {
  if (!userId || !token) return;
  const contextFile = account?.accountId
    ? getAccountPaths(stateDir, account.accountId).contextFile
    : getPaths(stateDir).contextFile;
  const tokens = await readJson(contextFile, {});
  tokens[userId] = token;
  await writeJson(contextFile, tokens);
}

export function textFromItems(items = []) {
  for (const item of items) {
    if (item.type === 1 && item.text_item?.text != null) return String(item.text_item.text);
    if (item.voice_item?.text) return String(item.voice_item.text);
  }
  return "";
}

function getContextTokenForTarget(tokens, target) {
  return tokens[target];
}

export function filterMarkdown(text) {
  const filter = new StreamingMarkdownFilter();
  return filter.feed(String(text ?? "")) + filter.flush();
}

function buildSendTextItem(text) {
  return { type: 1, text_item: { text } };
}

function validateWechatSendResponse(response, { label, clientId, to }) {
  const hasRet = response && typeof response === "object" && "ret" in response;
  const hasErrCode = response && typeof response === "object" && "errcode" in response;
  const retCode = hasRet ? Number(response.ret) : 0;
  const errCode = hasErrCode ? Number(response.errcode) : 0;
  if ((hasRet && retCode !== 0) || (hasErrCode && errCode !== 0)) {
    const parts = [
      `${label} 业务校验失败`,
      `clientId=${clientId}`,
      `to=${to}`,
    ];
    if (hasRet) parts.push(`ret=${retCode}`);
    if (hasErrCode) parts.push(`errcode=${errCode}`);
    if (response?.errmsg) parts.push(`errmsg=${String(response.errmsg).slice(0, 500)}`);
    const error = Object.assign(new Error(parts.join(" ")), {
      ret: hasRet ? retCode : undefined,
      errcode: hasErrCode ? errCode : undefined,
      errmsg: response?.errmsg,
      response,
    });
    throw error;
  }
  return hasRet || hasErrCode ? "business" : "http-only";
}

async function sendWechatMessageItem({
  account,
  to,
  item,
  contextToken = undefined,
  clientId = generateId("openclaw-weixin"),
  timeoutMs = 15_000,
}) {
  const response = await postJson("ilink/bot/sendmessage", {
    msg: {
      from_user_id: "",
      to_user_id: to,
      client_id: clientId,
      message_type: 2,
      message_state: 2,
      item_list: [item],
      context_token: contextToken,
    },
    base_info: baseInfo(),
  }, {
    baseUrl: account.baseUrl || apiBaseUrl,
    token: account.token,
    timeoutMs,
  });
  const ackMode = validateWechatSendResponse(response, {
    label: "sendmessage",
    clientId,
    to,
  });
  return { clientId, ackMode, response };
}

export async function sendMessage({ stateDir, account, to, message, markdown = false, reply = false }) {
  const target = to || account.userId;
  if (!target) throw new Error("缺少目标 userId（账号未提供默认 userId，请显式传 to）");
  if (!message || !String(message).trim()) throw new Error("message 不能为空");
  const contextToken = reply
    ? getContextTokenForTarget(await getContextTokens(stateDir, account), target)
    : undefined;
  const text = markdown ? filterMarkdown(message) : String(message);
  syncStandaloneEnv(stateDir);
  const sent = await sendWechatMessageItem({
    account,
    to: target,
    item: buildSendTextItem(text),
    contextToken,
  });
  return {
    clientId: sent.clientId,
    to: target,
    reply,
    hasContextToken: Boolean(contextToken),
    usedContextToken: Boolean(contextToken),
    ackMode: sent.ackMode,
  };
}


function contentTypeToExt(contentType, url) {
  const clean = String(contentType || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "application/pdf": ".pdf",
  };
  if (map[clean]) return map[clean];
  try {
    const ext = path.extname(new URL(url).pathname);
    if (ext) return ext;
  } catch {
    // fall through
  }
  return ".bin";
}

export function mimeFromFilename(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".zip": "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

export async function downloadRemoteMediaToTemp(url, stateDir) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`远程媒体下载失败：${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = contentTypeToExt(res.headers.get("content-type"), url);
  const dir = path.join(stateDir, "tmp");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `weixin-remote-${crypto.randomUUID()}${ext}`);
  await fs.writeFile(filePath, buf);
  return filePath;
}
export async function sendMediaMessage({ stateDir, account, to, message = "", mediaUrl, filePath = "", markdown = false, reply = false }) {
  const target = to || account.userId;
  if (!target) throw new Error("缺少目标 userId（账号未提供默认 userId，请显式传 to）");
  const contextToken = reply
    ? getContextTokenForTarget(await getContextTokens(stateDir, account), target)
    : undefined;
  let localPath = filePath || mediaUrl;
  if (!localPath) throw new Error("缺少 mediaUrl 或 filePath");
  if (/^https?:\/\//.test(localPath)) localPath = await downloadRemoteMediaToTemp(localPath, stateDir);
  if (localPath.startsWith("file://")) localPath = new URL(localPath).pathname;
  if (!path.isAbsolute(localPath)) localPath = path.resolve(localPath);
  await fs.access(localPath);

  const text = markdown ? filterMarkdown(message) : String(message || "");
  const mime = mimeFromFilename(localPath);
  syncStandaloneEnv(stateDir);
  const uploadOpts = {
    baseUrl: account.baseUrl || apiBaseUrl,
    token: account.token,
  };
  let mediaItem;
  if (mime.startsWith("video/")) {
    const uploaded = await uploadVideoToWeixin({
      filePath: localPath,
      toUserId: target,
      opts: uploadOpts,
      cdnBaseUrl,
    });
    mediaItem = {
      type: 5,
      video_item: {
        media: {
          encrypt_query_param: uploaded.downloadEncryptedQueryParam,
          aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
          encrypt_type: 1,
        },
        video_size: uploaded.fileSizeCiphertext,
      },
    };
  } else if (mime.startsWith("image/")) {
    const uploaded = await uploadFileToWeixin({
      filePath: localPath,
      toUserId: target,
      opts: uploadOpts,
      cdnBaseUrl,
    });
    mediaItem = {
      type: 2,
      image_item: {
        media: {
          encrypt_query_param: uploaded.downloadEncryptedQueryParam,
          aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
          encrypt_type: 1,
        },
        mid_size: uploaded.fileSizeCiphertext,
      },
    };
  } else {
    const uploaded = await uploadFileAttachmentToWeixin({
      filePath: localPath,
      fileName: path.basename(localPath),
      toUserId: target,
      opts: uploadOpts,
      cdnBaseUrl,
    });
    mediaItem = {
      type: 4,
      file_item: {
        media: {
          encrypt_query_param: uploaded.downloadEncryptedQueryParam,
          aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
          encrypt_type: 1,
        },
        file_name: path.basename(localPath),
        len: String(uploaded.fileSize),
      },
    };
  }
  const sentItems = [];
  if (text) {
    sentItems.push(await sendWechatMessageItem({
      account,
      to: target,
      item: buildSendTextItem(text),
      contextToken,
    }));
  }
  sentItems.push(await sendWechatMessageItem({
    account,
    to: target,
    item: mediaItem,
    contextToken,
  }));
  const result = sentItems.at(-1);
  return {
    clientId: result.clientId,
    clientIds: sentItems.map((item) => item.clientId),
    to: target,
    reply,
    hasContextToken: Boolean(contextToken),
    usedContextToken: Boolean(contextToken),
    mediaType: mime,
    ackMode: sentItems.every((item) => item.ackMode === "business") ? "business" : "http-only",
    ackModes: sentItems.map((item) => item.ackMode),
  };
}

export async function getUpdates(stateDir, account, timeoutMs = defaultLongPollTimeoutMs) {
  syncStandaloneEnv(stateDir);
  const { syncFile } = account?.accountId ? getAccountPaths(stateDir, account.accountId) : getPaths(stateDir);
  const sync = await readJson(syncFile, { get_updates_buf: "" });
  const resp = await getOfficialUpdates({
    baseUrl: account.baseUrl || apiBaseUrl,
    token: account.token,
    get_updates_buf: sync.get_updates_buf || "",
    timeoutMs,
  });
  const nextTimeoutMs =
    Number.isFinite(resp.longpolling_timeout_ms) && resp.longpolling_timeout_ms > 0
      ? resp.longpolling_timeout_ms
      : timeoutMs;
  const retCode = Number(resp.ret || 0);
  const errCode = Number(resp.errcode || 0);
  if (retCode !== 0 || errCode !== 0) {
    const parts = [
      "微信轮询失败",
      `ret=${retCode}`,
      `errcode=${errCode}`,
    ];
    if (resp.errmsg) parts.push(`errmsg=${String(resp.errmsg).slice(0, 500)}`);
    const error = Object.assign(new Error(parts.join(" ")), {
      ret: retCode,
      errcode: errCode,
      errmsg: resp.errmsg,
      nextTimeoutMs,
    });
    throw error;
  }
  if (resp.get_updates_buf != null && resp.get_updates_buf !== "") {
    await writeJson(syncFile, { get_updates_buf: resp.get_updates_buf });
  }
  return {
    messages: Array.isArray(resp.msgs) ? resp.msgs : [],
    nextTimeoutMs,
  };
}

export async function writeInbox(stateDir, message) {
  const inboxDir = getInboxAliasDir(stateDir, await resolveInboxAlias(stateDir, message));
  await fs.mkdir(inboxDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(inboxDir, `${stamp}-${message.from}.json`);
  await writeJson(file, message, 0o600);
  return file;
}

export async function listInbox(stateDir, { account, limit = 50, since } = { account: undefined, limit: 50, since: undefined }) {
  if (!account) {
    throw new Error("listInbox 必须传入 account=default 或账号 alias，不再支持聚合全部账号 inbox");
  }
  const resolved = await resolveAccount(stateDir, account);
  const inboxDir = getInboxAliasDir(stateDir, resolved.alias);
  if (!fsSync.existsSync(inboxDir)) return [];
  const files = (await fs.readdir(inboxDir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  const sinceMs = since ? Date.parse(since) : 0;
  const out = [];
  for (const f of files) {
    const data = await readJson(path.join(inboxDir, f), null);
    if (!data) continue;
    if (sinceMs && Date.parse(data.receivedAt) <= sinceMs) continue;
    out.push(data);
    if (out.length >= limit) break;
  }
  return out;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
