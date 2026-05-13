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
