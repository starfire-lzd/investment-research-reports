import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { sendWeixinMediaFile } from "@tencent-weixin/openclaw-weixin/dist/src/messaging/send-media.js";
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

const messageItemType = {
  TEXT: 1,
  IMAGE: 2,
  FILE: 4,
  VIDEO: 5,
};

const uploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
};

export function getStateDir(root = process.cwd()) {
  return process.env.WEIXIN_BRIDGE_STATE || path.join(root, ".weixin-bridge");
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

export async function ensureState(stateDir) {
  const p = getPaths(stateDir);
  await fs.mkdir(p.stateDir, { recursive: true });
  await fs.mkdir(p.inboxDir, { recursive: true });
}

export async function appendLog(stateDir, line) {
  await ensureState(stateDir);
  const { logFile } = getPaths(stateDir);
  await fs.appendFile(logFile, `${new Date().toISOString()} ${line}\n`);
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
  const headers = {
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

export async function postJson(endpoint, body, opts = {}) {
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

export async function getJson(endpoint, opts = {}) {
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
  const paths = getPaths(stateDir);
  const accountPaths = getAccountPaths(stateDir, account.accountId);
  await writeJson(accountPaths.accountFile, account);
  const def = await readJson(paths.accountFile, null);
  if (makeDefault || !def?.token) await writeJson(paths.accountFile, account);
}

export async function resolveAccount(stateDir, accountId) {
  const accounts = await listAccounts(stateDir);
  if (!accounts.length) {
    const legacy = await loadDefaultAccount(stateDir);
    if (legacy?.token) return legacy;
    throw new Error("微信未登录。请先运行 npm run weixin:login 或 npm run weixin:import-openclaw。");
  }
  if (!accountId) return accounts[0];
  const hit = accounts.find((a) => a.accountId === accountId);
  if (!hit) throw new Error(`未找到 accountId=${accountId}（已登录：${accounts.map((a) => a.accountId).join(", ")}）`);
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

export async function sendMessage({ stateDir, account, to, message, markdown = false }) {
  const target = to || account.userId;
  if (!target) throw new Error("缺少目标 userId（账号未提供默认 userId，请显式传 to）");
  if (!message || !String(message).trim()) throw new Error("message 不能为空");
  const tokens = await getContextTokens(stateDir, account);
  const contextToken = getContextTokenForTarget(tokens, target);
  const clientId = `codex-weixin-${crypto.randomUUID()}`;
  const text = markdown ? filterMarkdown(message) : String(message);
  await postJson("ilink/bot/sendmessage", {
    msg: {
      from_user_id: "",
      to_user_id: target,
      client_id: clientId,
      // message_type 必须为 2 (BOT)；填 1 (USER) 会返回 200 但不下发
      message_type: 2,
      message_state: 2,
      item_list: [{ type: messageItemType.TEXT, text_item: { text } }],
      context_token: contextToken,
    },
    base_info: baseInfo(),
  }, {
    baseUrl: account.baseUrl,
    token: account.token,
    timeoutMs: 15_000,
  });
  return { clientId, to: target, hasContextToken: Boolean(contextToken) };
}

function aesEcbPaddedSize(bytes) {
  const rem = bytes % 16;
  return bytes + (rem === 0 ? 16 : 16 - rem);
}

function encryptAesEcb(buffer, aeskey) {
  const cipher = crypto.createCipheriv("aes-128-ecb", aeskey, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
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

async function uploadBufferToCdn({ buffer, uploadFullUrl, uploadParam, filekey, aeskey, label }) {
  const ciphertext = encryptAesEcb(buffer, aeskey);
  const url = uploadFullUrl?.trim()
    || (uploadParam ? `${cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}` : "");
  if (!url) throw new Error(`${label}: getuploadurl 未返回 upload URL`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext),
      });
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`CDN 上传客户端错误 ${res.status}: ${await res.text()}`);
      }
      if (res.status !== 200) throw new Error(`CDN 上传失败 ${res.status}: ${await res.text()}`);
      const downloadParam = res.headers.get("x-encrypted-param");
      if (!downloadParam) throw new Error("CDN 响应缺少 x-encrypted-param");
      return downloadParam;
    } catch (err) {
      lastError = err;
      if (String(err.message || err).includes("客户端错误")) throw err;
      if (attempt < 3) await sleep(800 * attempt);
    }
  }
  throw lastError;
}

async function uploadMedia({ account, target, filePath, mediaType }) {
  const plaintext = await fs.readFile(filePath);
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = crypto.randomBytes(16).toString("hex");
  const aeskey = crypto.randomBytes(16);
  const resp = await postJson("ilink/bot/getuploadurl", {
    filekey,
    media_type: mediaType,
    to_user_id: target,
    rawsize,
    rawfilemd5,
    filesize,
    no_need_thumb: true,
    aeskey: aeskey.toString("hex"),
    base_info: baseInfo(),
  }, {
    baseUrl: account.baseUrl,
    token: account.token,
    timeoutMs: 15_000,
  });
  const downloadEncryptedQueryParam = await uploadBufferToCdn({
    buffer: plaintext,
    uploadFullUrl: resp.upload_full_url,
    uploadParam: resp.upload_param,
    filekey,
    aeskey,
    label: "uploadMedia",
  });
  return {
    filekey,
    downloadEncryptedQueryParam,
    aeskey: aeskey.toString("hex"),
    aeskeyBase64: aeskey.toString("base64"),
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
  };
}

async function sendOneItem({ account, target, contextToken, item }) {
  const clientId = `codex-weixin-${crypto.randomUUID()}`;
  await postJson("ilink/bot/sendmessage", {
    msg: {
      from_user_id: "",
      to_user_id: target,
      client_id: clientId,
      message_type: 2,
      message_state: 2,
      item_list: [item],
      context_token: contextToken,
    },
    base_info: baseInfo(),
  }, {
    baseUrl: account.baseUrl,
    token: account.token,
    timeoutMs: 15_000,
  });
  return clientId;
}

export async function sendMediaMessage({ stateDir, account, to, message = "", mediaUrl, filePath, markdown = false }) {
  const target = to || account.userId;
  if (!target) throw new Error("缺少目标 userId（账号未提供默认 userId，请显式传 to）");
  const tokens = await getContextTokens(stateDir, account);
  const contextToken = getContextTokenForTarget(tokens, target);
  let localPath = filePath || mediaUrl;
  if (!localPath) throw new Error("缺少 mediaUrl 或 filePath");
  if (/^https?:\/\//.test(localPath)) localPath = await downloadRemoteMediaToTemp(localPath, stateDir);
  if (localPath.startsWith("file://")) localPath = new URL(localPath).pathname;
  if (!path.isAbsolute(localPath)) localPath = path.resolve(localPath);
  await fs.access(localPath);

  const text = markdown ? filterMarkdown(message) : String(message || "");
  const mime = mimeFromFilename(localPath);
  const result = await sendWeixinMediaFile({
    filePath: localPath,
    to: target,
    text,
    opts: { baseUrl: account.baseUrl, token: account.token, contextToken },
    cdnBaseUrl,
  });
  return {
    clientId: result.messageId,
    clientIds: [result.messageId],
    to: target,
    hasContextToken: Boolean(contextToken),
    mediaType: mime,
  };
}

export async function getUpdates(stateDir, account, timeoutMs = defaultLongPollTimeoutMs) {
  const { syncFile } = account?.accountId ? getAccountPaths(stateDir, account.accountId) : getPaths(stateDir);
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
    if (err.name === "AbortError") return { messages: [], nextTimeoutMs: timeoutMs };
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

export async function writeInbox(stateDir, message) {
  const { inboxDir } = getPaths(stateDir);
  await fs.mkdir(inboxDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(inboxDir, `${stamp}-${message.from}.json`);
  await writeJson(file, message, 0o600);
  return file;
}

export async function listInbox(stateDir, { limit = 50, since } = {}) {
  const { inboxDir } = getPaths(stateDir);
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
