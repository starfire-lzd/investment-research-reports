#!/usr/bin/env node
import process from "node:process";

import { mainBridge } from "./weixin-bridge.js";
import { mainServer } from "./weixin-server.js";
import { mainService } from "./weixin-service.js";

function usage() {
  console.log(`Usage:
  node dist/index.js login --alias ACCOUNT_ALIAS [--default]
  node dist/index.js import-openclaw --alias ACCOUNT_ALIAS [--default]
  node dist/index.js status
  node dist/index.js listen [--account ACCOUNT_ALIAS|default] [--codex] [--write] [--once]
  node dist/index.js server [--no-listen] [--codex] [--write]
  node dist/index.js service install|start|stop|restart|status|uninstall [...args]`);
}

async function main(argv = process.argv.slice(2)) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    return usage();
  }

  if (cmd === "server") {
    return await mainServer(args);
  }
  if (cmd === "service") {
    return await mainService(args);
  }
  return await mainBridge(argv);
}

await main();
