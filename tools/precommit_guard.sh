#!/bin/bash
# tools/precommit_guard.sh — 提交前守門：機密／立場文件不得入库
#
# 設計原則：
#   1. 這個腳本本身不含任何敏感詞——它不會成為洩漏源。
#   2. 詞表放在 local-only/guard-terms.txt（已被 .gitignore 排除），只在本地存在。
#   3. 詞表缺失時「略過」並印出警告（換機器不會卡住開發）。
#
# 用法：
#   tools/precommit_guard.sh              掃描已暫存（staged）的內容，有命中就 exit 1
#   tools/precommit_guard.sh --all        掃描整個工作區（tracked 檔案）
#   tools/precommit_guard.sh --file PATH  掃描指定檔案（單檔檢查）
#   GUHAI_ALLOW_SENSITIVE=1 git commit …  明確放行（會印出警告）
#
# 安裝為 git hook：tools/install_hooks.sh

set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "guard: 不在 git 倉庫內" >&2
  exit 0
}
TERMS="$ROOT/local-only/guard-terms.txt"
MODE="staged"
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --all)  MODE="all"; shift ;;
    --file) MODE="file"; TARGET="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) shift ;;
  esac
done

if [ ! -f "$TERMS" ]; then
  echo "guard: 找不到 local-only/guard-terms.txt，本次略過守門。" >&2
  exit 0
fi

LIST="$(mktemp)"
trap 'rm -f "$LIST" "$REPORT"' EXIT
grep -v '^[[:space:]]*#' "$TERMS" 2>/dev/null | grep -v '^[[:space:]]*$' > "$LIST"
COUNT=$(wc -l < "$LIST" | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "guard: 詞表為空，本次略過。" >&2
  exit 0
fi

REPORT="$(mktemp)"
BAD=0

scan_stdin() {  # $1 = 顯示名稱；stdin = 內容
  local label="$1" tmp hits n ln body
  tmp=$(mktemp)
  cat > "$tmp"
  hits=$(grep -n -F -f "$LIST" "$tmp" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    n=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
    {
      echo "  ✗ $label（$n 處）"
      printf '%s\n' "$hits" | head -5 | while IFS= read -r line; do
        ln="${line%%:*}"; body="${line#*:}"
        echo "      L$ln  $body"
      done
      [ "$n" -gt 5 ] && echo "      …（另有 $((n - 5)) 處）"
    } >> "$REPORT"
    BAD=$((BAD + 1))
  fi
  rm -f "$tmp"
}

case "$MODE" in
  file)
    [ -f "$TARGET" ] || { echo "guard: 找不到檔案 $TARGET" >&2; exit 0; }
    scan_stdin "$TARGET" < "$TARGET"
    ;;
  all)
    while IFS= read -r f; do
      case "$f" in
        local-only/*|*.png|*.jpg|*.jpeg|*.gif|*.pdf|*.mp4|*.epub|*.zip|*.woff*|*.ico) continue ;;
      esac
      [ -f "$ROOT/$f" ] && scan_stdin "$f" < "$ROOT/$f"
    done < <(cd "$ROOT" && git ls-files)
    ;;
  staged)
    while IFS= read -r f; do
      case "$f" in
        local-only/*|*.png|*.jpg|*.jpeg|*.gif|*.pdf|*.mp4|*.epub|*.zip|*.woff*|*.ico) continue ;;
      esac
      scan_stdin "$f" < <(cd "$ROOT" && git show ":$f" 2>/dev/null)
    done < <(cd "$ROOT" && git diff --cached --name-only --diff-filter=ACM)
    ;;
esac

if [ "$BAD" -gt 0 ]; then
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo " 提交被攔下：偵測到機密／立場類內容（$BAD 個檔案）"
  echo "════════════════════════════════════════════════════════"
  cat "$REPORT"
  echo ""
  echo " 這些內容屬於保密範圍，不得入库（倉庫是公開的）。"
  echo " 處理方式："
  echo "   1. 移出倉庫：mv <檔案> local-only/  （local-only/ 已被 .gitignore 排除）"
  echo "   2. 確認誤判：GUHAI_ALLOW_SENSITIVE=1 git commit …"
  echo ""
  exit 1
fi

echo "guard: ✓ 未命中機密詞（$COUNT 條）"
exit 0