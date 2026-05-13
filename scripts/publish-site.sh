#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  git add .
  git commit -m "Update research reports"
else
  echo "No changes to publish."
fi

git push

