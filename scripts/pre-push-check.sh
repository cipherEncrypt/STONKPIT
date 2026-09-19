#!/usr/bin/env bash
# Run before git push to catch secrets / ledger / keys accidentally staged.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
FAIL=0

echo "StonkPit pre-push safety check"
echo "=============================="

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo -e "${RED}Not a git repo yet. Run: git init${NC}"
  exit 1
fi

# Files that must never be tracked
FORBIDDEN_PATHS=(
  ".env"
  "data/stonkpit.json"
  "keys"
  "test-ledger"
  ".validator"
  "node_modules"
  ".next"
  "target"
)

echo ""
echo "1) Checking forbidden paths are ignored..."
for p in "${FORBIDDEN_PATHS[@]}"; do
  if [[ -e "$p" ]] && ! git check-ignore -q "$p" 2>/dev/null; then
    echo -e "${RED}  FAIL: $p exists but is NOT gitignored${NC}"
    FAIL=1
  else
    echo -e "${GREEN}  OK${NC}   $p"
  fi
done

echo ""
echo "2) Checking staged files for sensitive patterns..."
STAGED="$(git diff --cached --name-only 2>/dev/null || true)"
if [[ -z "$STAGED" ]]; then
  echo "  (nothing staged — run git add before push)"
else
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    case "$f" in
      .env|.env.local|.env.production|keys/*|test-ledger/*|.validator/*)
        echo -e "${RED}  FAIL: staged forbidden file: $f${NC}"
        FAIL=1
        ;;
      data/*)
        if [[ "$f" != "data/.gitkeep" ]]; then
          echo -e "${RED}  FAIL: staged forbidden file: $f${NC}"
          FAIL=1
        fi
        ;;
    esac
    # Skip docs/examples/scripts that mention env var names in comments
    case "$f" in
      .env.example|scripts/*|docs/*|README.md|ARCHITECTURE.md) continue ;;
    esac
    CONTENT="$(git show ":$f" 2>/dev/null || true)"
    if echo "$CONTENT" | grep -E 'g\.alchemy\.com/v2/' | grep -viE 'YOUR_|EXAMPLE|placeholder|<base58>' | grep -q .; then
      echo -e "${RED}  FAIL: possible Alchemy API key in: $f${NC}"
      FAIL=1
    fi
    if echo "$CONTENT" | grep -E '^TREASURY_PRIVATE_KEY=[^#[:space:]]' | grep -q .; then
      echo -e "${RED}  FAIL: treasury private key in: $f${NC}"
      FAIL=1
    fi
    if echo "$CONTENT" | grep -qE 'BEGIN (RSA |OPENSSH )?PRIVATE KEY'; then
      echo -e "${RED}  FAIL: PEM private key in: $f${NC}"
      FAIL=1
    fi
  done <<< "$STAGED"
  if [[ "$FAIL" -eq 0 ]]; then
    echo -e "${GREEN}  OK${NC}   no secrets in staged diff"
  fi
fi

echo ""
echo "3) Verifying .env is not tracked..."
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo -e "${RED}  FAIL: .env is tracked by git — run: git rm --cached .env${NC}"
  FAIL=1
else
  echo -e "${GREEN}  OK${NC}   .env not tracked"
fi

echo ""
if [[ "$FAIL" -ne 0 ]]; then
  echo -e "${RED}Fix issues above before pushing.${NC}"
  exit 1
fi
echo -e "${GREEN}All checks passed. Safe to push.${NC}"
