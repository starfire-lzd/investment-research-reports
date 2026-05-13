#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import qrcode from "qrcode-terminal";

import {
  apiBaseUrl,
  defaultBotType,
  defaultLongPollTimeoutMs,
  maxConsecutiveFailures,
  backoffDelayMs,
  retryDelayMs,
  appendLog,
  ensureState,
  getJson,
  getAccountPaths,
  getPaths,
  getStateDir,
  getUpdates,
  loadDefaultAccount,
  normalizeAccountId,
  postJson,
  projectRoot,
  resolveAccount,
  saveAccount,
  sendMediaMessage,
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
  node dist/weixin-bridge.js login
  node dist/weixin-bridge.js import-openclaw
  node dist/weixin-bridge.js status
  node dist/weixin-bridge.js listen [--codex] [--write] [--once]
  node dist/weixin-bridge.js send --message "text" [--to user@im.wechat]
  node dist/weixin-bridge.js send-media --media-url <url-or-path> [--message "caption"]

Notes:
  - Default listen mode is local command mode.
  - --codex routes inbound messages to codex exec in read-only sandbox.
  - --write changes Codex sandbox to workspace-write.
  - For HTTP API usage prefer node dist/weixin-server.js.`);
}

function argValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

async function login(args = []) {
  await ensureState(stateDir);
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
        name: argValue(args, "--account-name"),
        token: status.bot_token,
        baseUrl: status.baseurl || baseUrl,
        userId: status.ilink_user_id,
        savedAt: new Date().toISOString(),
      };
      await saveAccount(stateDir, account, { makeDefault: args.includes("--default") });
      console.log(`登录成功：${accountId}`);
      if (account.name) console.log(`账号名：${account.name}`);
      if (account.userId) console.log(`扫码用户：${account.userId}`);
      return;
    }
    if (status.status === "expired") throw new Error("二维码已过期。");
    await sleep(1200);
  }
  throw new Error("等待扫码超时。");
}

async function importOpenClaw() {
  await ensureState(stateDir);
  const account = await loadDefaultAccount(stateDir);
  if (!account?.token) {
    throw new Error("未找到可导入的 OpenClaw 微信登录凭据，请先运行 login。");
  }
  await saveAccount(stateDir, account, { makeDefault: true });

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
  const account = await resolveAccount(stateDir);
  await writeJson(paths.accountFile, account);
  console.log(`listening account=${account.accountId} baseUrl=${account.baseUrl}`);
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

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (!cmd || cmd === "help" || cmd === "--help") return usage();
    if (cmd === "login") return await login(args);
    if (cmd === "import-openclaw") return await importOpenClaw();
    if (cmd === "status") {
      const account = await loadDefaultAccount(stateDir);
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
      const accountId = argValue(args, "--account");
      if (!message) throw new Error("缺少消息内容。");
      const account = await resolveAccount(stateDir, accountId);
      const result = await sendMessage({ stateDir, account, to, message, markdown: args.includes("--markdown") });
      console.log(`sent ${result.clientId} -> ${result.to}`);
      return;
    }
    if (cmd === "send-media") {
      const message = argValue(args, "--message") || "";
      const to = argValue(args, "--to");
      const accountId = argValue(args, "--account");
      const mediaUrl = argValue(args, "--media-url") || argValue(args, "--file");
      if (!mediaUrl) throw new Error("缺少 --media-url 或 --file");
      const account = await resolveAccount(stateDir, accountId);
      const result = await sendMediaMessage({
        stateDir,
        account,
        to,
        message,
        mediaUrl,
        markdown: args.includes("--markdown"),
      });
      console.log(`sent media ${result.clientId} -> ${result.to} (${result.mediaType})`);
      return;
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
