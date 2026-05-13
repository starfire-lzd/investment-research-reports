import crypto from "node:crypto";

export function generateId(prefix = "openclaw-weixin") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function tempFileName(prefix, ext = ".bin") {
  return `${prefix}-${crypto.randomUUID()}${ext}`;
}
