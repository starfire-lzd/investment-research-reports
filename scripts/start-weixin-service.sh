#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

label="com.lizhengda.investment-research.weixin-bridge"
if [ ! -d tools/weixin-bridge/node_modules ]; then
  npm --prefix tools/weixin-bridge install
fi

if launchctl print "gui/$(id -u)/${label}" >/dev/null 2>&1; then
  npm --prefix tools/weixin-bridge run service:start -- "$@"
else
  npm --prefix tools/weixin-bridge run service:install -- "$@"
fi
