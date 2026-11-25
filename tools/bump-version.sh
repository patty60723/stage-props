#!/usr/bin/env bash
# 更新網頁資源的版本號（?v=...），讓瀏覽器在發佈新版後一定會重新下載，不會卡在舊快取。
# 每次推上去之前執行一次：  bash tools/bump-version.sh
set -euo pipefail
cd "$(dirname "$0")/.."
V="${1:-$(date -u +%Y%m%d%H%M)}"
sed -i -E "s#(\.(js|css))\?v=[0-9A-Za-z]+#\1?v=$V#g" index.html demo.html app.js sync.js beta/index.html beta/app.js
echo "version -> $V"
