import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function resolvePreferredOpenClawTmpDir() {
  return process.env.WEIXIN_BRIDGE_STATE
    ? path.join(process.env.WEIXIN_BRIDGE_STATE, "openclaw-tmp")
    : path.join(os.tmpdir(), "codex-weixin-openclaw-tmp");
}

export async function withFileLock(_lockPath, fn) {
  await fs.mkdir(resolvePreferredOpenClawTmpDir(), { recursive: true });
  return await fn();
}
