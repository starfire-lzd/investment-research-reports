export const logger = {
  debug(message) {
    if (process.env.WEIXIN_DEBUG) console.error(`[weixin-openclaw] ${message}`);
  },
  info(message) {
    if (process.env.WEIXIN_DEBUG) console.error(`[weixin-openclaw] ${message}`);
  },
  warn(message) {
    console.error(`[weixin-openclaw] WARN ${message}`);
  },
  error(message) {
    console.error(`[weixin-openclaw] ERROR ${message}`);
  },
};
