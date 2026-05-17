import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_ILINK_BOT_TYPE,
  startWeixinLoginWithQr,
  waitForWeixinLogin,
} from "@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js";

import {
  apiBaseUrl,
  ensureState,
  normalizeAccountAlias,
  normalizeAccountId,
  saveAccount,
  writeJson,
  readJson,
} from "./weixin-core.js";

export type LoginSessionStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "expired";

export type LoginSessionRecord = {
  sessionId: string;
  alias: string;
  accountName?: string;
  botType: string;
  makeDefault: boolean;
  qrcodeUrl: string;
  remoteSessionKey: string;
  status: LoginSessionStatus;
  startedAt: string;
  expiresAt: string;
  finishedAt?: string;
  error?: string;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
};

type StartLoginOptions = {
  alias: string;
  accountName?: string;
  botType?: string;
  makeDefault?: boolean;
};

type AwaitLoginOptions = {
  timeoutMs?: number;
};

const defaultLoginTimeoutMs = 5 * 60_000;

function loginSessionsDir(stateDir: string) {
  return path.join(stateDir, "login-sessions");
}

function loginSessionFile(stateDir: string, sessionId: string) {
  return path.join(loginSessionsDir(stateDir), `${sessionId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(msFromNow: number) {
  return new Date(Date.now() + msFromNow).toISOString();
}

async function saveLoginSession(stateDir: string, session: LoginSessionRecord) {
  await fs.mkdir(loginSessionsDir(stateDir), { recursive: true });
  await writeJson(loginSessionFile(stateDir, session.sessionId), session);
}

export async function getLoginSession(stateDir: string, sessionId: string) {
  const session = await readJson(loginSessionFile(stateDir, sessionId), null);
  return session as LoginSessionRecord | null;
}

export async function listLoginSessions(stateDir: string, { limit = 20 } = {}) {
  const dir = loginSessionsDir(stateDir);
  try {
    const files = (await fs.readdir(dir))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);
    const sessions = await Promise.all(
      files.map(async (file) => {
        const session = await readJson(path.join(dir, file), null);
        return session as LoginSessionRecord | null;
      }),
    );
    return sessions.filter(Boolean);
  } catch {
    return [];
  }
}

export function publicLoginSession(session: LoginSessionRecord | null) {
  if (!session) return null;
  const { remoteSessionKey: _remoteSessionKey, ...rest } = session;
  return rest;
}

export async function startLoginSession(stateDir: string, options: StartLoginOptions) {
  await ensureState(stateDir);
  const alias = normalizeAccountAlias(options.alias);
  if (!alias) {
    throw new Error("login start 必须提供 alias");
  }
  const botType = String(options.botType || DEFAULT_ILINK_BOT_TYPE);
  const started = await startWeixinLoginWithQr({
    apiBaseUrl,
    botType,
  });
  if (!started?.qrcodeUrl || !started?.sessionKey) {
    throw new Error(`二维码响应异常：${started?.message || "未返回二维码"}`);
  }
  const session: LoginSessionRecord = {
    sessionId: crypto.randomUUID(),
    alias,
    accountName: options.accountName?.trim() || undefined,
    botType,
    makeDefault: Boolean(options.makeDefault),
    qrcodeUrl: started.qrcodeUrl,
    remoteSessionKey: started.sessionKey,
    status: "pending",
    startedAt: nowIso(),
    expiresAt: futureIso(defaultLoginTimeoutMs),
  };
  await saveLoginSession(stateDir, session);
  return session;
}

export async function awaitLoginSession(stateDir: string, sessionId: string, options: AwaitLoginOptions = {}) {
  const session = await getLoginSession(stateDir, sessionId);
  if (!session) {
    throw new Error(`未找到登录会话：${sessionId}`);
  }
  if (session.status !== "pending") {
    return session;
  }
  const timeoutMs = options.timeoutMs || defaultLoginTimeoutMs;
  try {
    const result = await waitForWeixinLogin({
      sessionKey: session.remoteSessionKey,
      apiBaseUrl,
      botType: session.botType,
      timeoutMs,
    });
    if (result.alreadyConnected) {
      const updated: LoginSessionRecord = {
        ...session,
        status: "failed",
        finishedAt: nowIso(),
        error: result.message || "二维码已失效或会话已被复用",
      };
      await saveLoginSession(stateDir, updated);
      return updated;
    }
    if (!result.connected || !result.botToken) {
      const updated: LoginSessionRecord = {
        ...session,
        status: "expired",
        finishedAt: nowIso(),
        error: result.message || "等待扫码超时",
      };
      await saveLoginSession(stateDir, updated);
      return updated;
    }
    const accountId = normalizeAccountId(result.accountId || "default@im.bot");
    const account = {
      accountId,
      alias: session.alias,
      name: session.accountName,
      token: result.botToken,
      baseUrl: result.baseUrl || apiBaseUrl,
      userId: result.userId,
      savedAt: nowIso(),
    };
    await saveAccount(stateDir, account, { makeDefault: session.makeDefault });
    const updated: LoginSessionRecord = {
      ...session,
      status: "succeeded",
      finishedAt: nowIso(),
      accountId,
      userId: result.userId,
      baseUrl: result.baseUrl || apiBaseUrl,
      error: undefined,
    };
    await saveLoginSession(stateDir, updated);
    return updated;
  } catch (error) {
    const updated: LoginSessionRecord = {
      ...session,
      status: "failed",
      finishedAt: nowIso(),
      error: String(error instanceof Error ? error.message : error).slice(0, 1000),
    };
    await saveLoginSession(stateDir, updated);
    return updated;
  }
}

export async function expirePendingLoginSessions(stateDir: string, reason = "服务重启，原登录会话已失效") {
  const sessions = await listLoginSessions(stateDir, { limit: 200 });
  await Promise.all(
    sessions
      .filter((session) => session.status === "pending")
      .map(async (session) => {
        const updated: LoginSessionRecord = {
          ...session,
          status: "expired",
          finishedAt: nowIso(),
          error: reason,
        };
        await saveLoginSession(stateDir, updated);
      }),
  );
}
