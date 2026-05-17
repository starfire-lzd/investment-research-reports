declare module "@tencent-weixin/openclaw-weixin/dist/src/channel.js" {
  export const weixinPlugin: {
    outbound: {
      sendMedia(args: {
        cfg: unknown;
        accountId: string;
        to: string;
        text: string;
        mediaUrl: string;
      }): Promise<{ messageId: string }>;
    };
  };
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/api/api.js" {
  export function notifyStart(args: {
    baseUrl?: string;
    token: string;
    timeoutMs?: number;
  }): Promise<unknown>;

  export function notifyStop(args: {
    baseUrl?: string;
    token: string;
    timeoutMs?: number;
  }): Promise<unknown>;

  export function getUpdates(args: {
    baseUrl?: string;
    token: string;
    get_updates_buf?: string;
    timeoutMs?: number;
  }): Promise<{
    ret?: number | string;
    errcode?: number | string;
    errmsg?: string;
    get_updates_buf?: string;
    longpolling_timeout_ms?: number;
    msgs?: unknown[];
  }>;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js" {
  export const DEFAULT_ILINK_BOT_TYPE: string;

  export function displayQRCode(input: string): Promise<void> | void;

  export function startWeixinLoginWithQr(args: {
    apiBaseUrl?: string;
    botType?: string;
  }): Promise<{
    qrcodeUrl?: string;
    sessionKey?: string;
    message?: string;
  }>;

  export function waitForWeixinLogin(args: {
    sessionKey: string;
    apiBaseUrl?: string;
    botType?: string;
    timeoutMs?: number;
  }): Promise<{
    alreadyConnected?: boolean;
    connected?: boolean;
    message?: string;
    botToken?: string;
    accountId?: string;
    baseUrl?: string;
    userId?: string;
  }>;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/messaging/inbound.js" {
  export function setContextToken(accountId: string, userId: string, token: string): void;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/messaging/send.js" {
  export class StreamingMarkdownFilter {
    feed(input: string): string;
    flush(): string;
  }
}

declare module "qrcode-terminal" {
  const qrcode: {
    generate(input: string, options?: { small?: boolean }): void;
  };
  export default qrcode;
}
