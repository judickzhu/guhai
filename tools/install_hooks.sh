#!/bin/bash
# tools/install_hooks.sh — 安裝 git hook（只寫 .git/hooks，不進版控）
set -eu
ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.git/hooks/pre-commit"
mkdir -p "$ROOT/.git/hooks"
cat > "$HOOK" <<'HOOKBODY'
#!/bin/sh
# 由 tools/install_hooks.sh 產生
if [ "${GUHAI_ALLOW_SENSITIVE:-0}" = "1" ]; then
  echo "guard: ⚠️  GUHAI_ALLOW_SENSITIVE=1，本次跳過守門" >&2
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel)"
[ -x "$ROOT/tools/precommit_guard.sh" ] || exit 0
exec "$ROOT/tools/precommit_guard.sh"
HOOKBODY
chmod +x "$HOOK"
chmod +x "$ROOT/tools/precommit_guard.sh"
echo "已安裝：$HOOK"
echo "詞表：$ROOT/local-only/guard-terms.txt"
