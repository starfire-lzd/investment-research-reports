import crypto from "node:crypto";

const channelVersion = "2.4.3";
const appId = "bot";
const appClientVersion = String((2 << 16) | (4 << 8) | 3);

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function baseInfo() {
  return {
    channel_version: channelVersion,
    bot_agent: "CodexWeixinBridge/0.3.0",
  };
}

function headers(token) {
  const out = {
    "Content-Type": "application/json",
    "iLink-App-Id": appId,
    "iLink-App-ClientVersion": appClientVersion,
    "X-WECHAT-UIN": randomWechatUin(),
  };
  if (token) {
    out.AuthorizationType = "ilink_bot_token";
    out.Authorization = `Bearer ${token}`;
  }
  return out;
}

async function postJson({ baseUrl, endpoint, body, token, timeoutMs }) {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(new URL(endpoint, `${baseUrl}/`), {
      method: "POST",
      headers: headers(token),
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

export async function getUploadUrl(params) {
  return postJson({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/getuploadurl",
    token: params.token,
    timeoutMs: params.timeoutMs ?? 15_000,
    body: {
      filekey: params.filekey,
      media_type: params.media_type,
      to_user_id: params.to_user_id,
      rawsize: params.rawsize,
      rawfilemd5: params.rawfilemd5,
      filesize: params.filesize,
      thumb_rawsize: params.thumb_rawsize,
      thumb_rawfilemd5: params.thumb_rawfilemd5,
      thumb_filesize: params.thumb_filesize,
      no_need_thumb: params.no_need_thumb,
      aeskey: params.aeskey,
      base_info: baseInfo(),
    },
  });
}

export async function sendMessage(params) {
  await postJson({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendmessage",
    token: params.token,
    timeoutMs: params.timeoutMs ?? 15_000,
    body: { ...params.body, base_info: baseInfo() },
  });
}
