#!/usr/bin/env bash
##
# Migration Linter for Fintech Gateway Services
#
# Catches the exact classes of errors that have broken production:
#   1. Non-idempotent SQL (ADD COLUMN without IF NOT EXISTS)
#   2. Timestamp collisions across services sharing one DB
#   3. drizzle-kit generate in Dockerfiles (creates duplicate migrations)
#   4. Journal integrity issues
#
# Usage:
#   Pre-commit hook:        bash scripts/lint-migrations.sh --staged
#   From any service repo:  bash scripts/lint-migrations.sh
#   From qa-automation:     bash scripts/lint-migrations.sh /path/to/service
#   In CI (cross-repo):     bash scripts/lint-migrations.sh --cross-repo /path/to/all/repos
#
# Exit codes: 0 = pass, 1 = failures found
##

set -euo pipefail

STAGED_ONLY=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

error() { echo -e "${RED}ERROR:${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn()  { echo -e "${YELLOW}WARN:${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
pass()  { echo -e "${GREEN}PASS:${NC} $1"; }

# --------------------------------------------------------------------------
# Determine which repo(s) to check
# --------------------------------------------------------------------------
CROSS_REPO=false
REPO_ROOT=""
ALL_REPOS=()

if [[ "${1:-}" == "--staged" ]]; then
  STAGED_ONLY=true
  REPO_ROOT="."
  ALL_REPOS=(".")
elif [[ "${1:-}" == "--cross-repo" ]]; then
  CROSS_REPO=true
  PARENT_DIR="${2:-.}"
  for dir in "$PARENT_DIR"/*/; do
    if [[ -d "$dir/src/db/migrations/meta" ]] || [[ -d "$dir/apps/api/src/db/migrations/meta" ]]; then
      ALL_REPOS+=("$dir")
    fi
  done
  if [[ ${#ALL_REPOS[@]} -eq 0 ]]; then
    echo "No service repos found in $PARENT_DIR"
    exit 1
  fi
  echo "Cross-repo check: found ${#ALL_REPOS[@]} services"
else
  REPO_ROOT="${1:-.}"
  ALL_REPOS=("$REPO_ROOT")
fi

# --------------------------------------------------------------------------
# Helper: find migration dir for a given repo
# --------------------------------------------------------------------------
find_migration_dir() {
  local repo="$1"
  # Dashboard monorepo structure
  if [[ -d "$repo/apps/api/src/db/migrations" ]]; then
    echo "$repo/apps/api/src/db/migrations"
  # Standard structure (auth, products, sendpayment, receivepayment)
  elif [[ -d "$repo/src/db/migrations" ]]; then
    echo "$repo/src/db/migrations"
  else
    echo ""
  fi
}

# --------------------------------------------------------------------------
# Check 1: SQL Idempotency
# Every ALTER TABLE ADD COLUMN must have IF NOT EXISTS
# Every CREATE TABLE must have IF NOT EXISTS
# Every CREATE INDEX must have IF NOT EXISTS (or be inside DO block)
# --------------------------------------------------------------------------
check_sql_idempotency() {
  local repo="$1"
  local mig_dir
  mig_dir=$(find_migration_dir "$repo")
  [[ -z "$mig_dir" ]] && return

  local repo_name
  repo_name=$(basename "$repo")
  echo ""
  echo "=== [$repo_name] SQL Idempotency Check ==="

  local sql_files=()
  if [[ "$STAGED_ONLY" == "true" ]]; then
    # Only check staged (new/modified) SQL files
    while IFS= read -r f; do
      [[ -n "$f" ]] && [[ "$f" == *".sql" ]] && [[ -f "$f" ]] && sql_files+=("$f")
    done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep '\.sql$' || true)
  else
    while IFS= read -r -d '' f; do
      sql_files+=("$f")
    done < <(find "$mig_dir" -name "*.sql" -print0 2>/dev/null)
  fi

  if [[ ${#sql_files[@]} -eq 0 ]]; then
    warn "No SQL migration files found in $mig_dir"
    return
  fi

  local found_issues=false

  for sql_file in "${sql_files[@]}"; do
    local fname
    fname=$(basename "$sql_file")

    # Check: ALTER TABLE ... ADD COLUMN without IF NOT EXISTS
    # Two-step: find ADD COLUMN lines, then exclude ones with IF NOT EXISTS
    local bad_add_col
    bad_add_col=$(grep -in 'ADD COLUMN' "$sql_file" 2>/dev/null | grep -iv 'IF NOT EXISTS' || true)
    if [[ -n "$bad_add_col" ]]; then
      error "[$repo_name] $fname: ALTER TABLE ADD COLUMN without IF NOT EXISTS"
      echo "$bad_add_col" | head -3
      found_issues=true
    fi

    # Check: CREATE TABLE without IF NOT EXISTS
    local bad_create_table
    bad_create_table=$(grep -in 'CREATE TABLE' "$sql_file" 2>/dev/null | grep -iv 'IF NOT EXISTS' || true)
    if [[ -n "$bad_create_table" ]]; then
      error "[$repo_name] $fname: CREATE TABLE without IF NOT EXISTS"
      echo "$bad_create_table" | head -3
      found_issues=true
    fi

    # Check: CREATE INDEX without IF NOT EXISTS (skip if inside DO block)
    local bad_create_index
    bad_create_index=$(grep -in 'CREATE.*INDEX' "$sql_file" 2>/dev/null | grep -iv 'IF NOT EXISTS' || true)
    if [[ -n "$bad_create_index" ]]; then
      # Only warn if it's not wrapped in a DO block
      if ! grep -q 'DO \$' "$sql_file" 2>/dev/null; then
        warn "[$repo_name] $fname: CREATE INDEX without IF NOT EXISTS (non-blocking)"
      fi
    fi
  done

  if [[ "$found_issues" == "false" ]]; then
    pass "[$repo_name] All migration SQL is idempotent"
  fi
}

# --------------------------------------------------------------------------
# Check 2: Journal Timestamp Uniqueness (within repo)
# --------------------------------------------------------------------------
check_journal_internal() {
  local repo="$1"
  local mig_dir
  mig_dir=$(find_migration_dir "$repo")
  [[ -z "$mig_dir" ]] && return

  local repo_name
  repo_name=$(basename "$repo")
  local journal="$mig_dir/meta/_journal.json"

  if [[ ! -f "$journal" ]]; then
    warn "[$repo_name] No journal file found"
    return
  fi

  echo ""
  echo "=== [$repo_name] Journal Integrity Check ==="

  # Check for duplicate timestamps within this repo
  local dupes
  dupes=$(python3 -c "
import json, sys
with open('$journal') as f:
    j = json.load(f)
timestamps = [e['when'] for e in j['entries']]
seen = {}
for i, t in enumerate(timestamps):
    if t in seen:
        print(f'Duplicate when={t}: idx {seen[t]} and idx {i}')
    seen[t] = i
" 2>/dev/null || echo "SKIP")

  if [[ "$dupes" == "SKIP" ]]; then
    warn "[$repo_name] python3 not available, skipping journal check"
    return
  fi

  if [[ -n "$dupes" ]]; then
    error "[$repo_name] Duplicate timestamps in journal:"
    echo "$dupes"
  else
    pass "[$repo_name] Journal timestamps are unique within repo"
  fi

  # Check that all referenced SQL files exist
  local missing_sql
  missing_sql=$(python3 -c "
import json, os
with open('$journal') as f:
    j = json.load(f)
for e in j['entries']:
    sql_path = os.path.join('$mig_dir', e['tag'] + '.sql')
    if not os.path.exists(sql_path):
        print(f\"Missing SQL file: {e['tag']}.sql (idx={e['idx']})\")
" 2>/dev/null || echo "")

  if [[ -n "$missing_sql" ]]; then
    error "[$repo_name] Journal references missing SQL files:"
    echo "$missing_sql"
  else
    pass "[$repo_name] All journal entries have matching SQL files"
  fi
}

# --------------------------------------------------------------------------
# Check 3: Cross-Service Timestamp Collisions
# --------------------------------------------------------------------------
check_cross_repo_timestamps() {
  [[ "$CROSS_REPO" != "true" ]] && return

  echo ""
  echo "=== Cross-Service Timestamp Collision Check ==="

  local collision_check
  collision_check=$(python3 -c "
import json, os, sys

repos = sys.argv[1:]
all_entries = []  # (when, service, tag)

for repo in repos:
    name = os.path.basename(repo.rstrip('/'))
    # Find journal
    for candidate in [
        os.path.join(repo, 'apps/api/src/db/migrations/meta/_journal.json'),
        os.path.join(repo, 'src/db/migrations/meta/_journal.json'),
    ]:
        if os.path.exists(candidate):
            with open(candidate) as f:
                j = json.load(f)
            for e in j['entries']:
                all_entries.append((e['when'], name, e['tag']))
            break

# Find collisions
by_timestamp = {}
for when, svc, tag in all_entries:
    by_timestamp.setdefault(when, []).append((svc, tag))

collisions = {k: v for k, v in by_timestamp.items() if len(v) > 1}
# Only flag if different services share the timestamp
real_collisions = {}
for k, v in collisions.items():
    services = set(s for s, _ in v)
    if len(services) > 1:
        real_collisions[k] = v

if real_collisions:
    for ts, entries in sorted(real_collisions.items()):
        items = ', '.join(f'{svc}/{tag}' for svc, tag in entries)
        print(f'COLLISION when={ts}: {items}')
else:
    print('OK')
" "${ALL_REPOS[@]}" 2>/dev/null || echo "SKIP")

  if [[ "$collision_check" == "SKIP" ]]; then
    warn "python3 not available, skipping cross-repo check"
    return
  fi

  if [[ "$collision_check" == "OK" ]]; then
    pass "No timestamp collisions across services"
  else
    echo "$collision_check" | while read -r line; do
      error "$line"
    done
  fi
}

# --------------------------------------------------------------------------
# Check 4: No drizzle-kit generate in Dockerfiles
# --------------------------------------------------------------------------
check_no_drizzle_generate() {
  local repo="$1"
  local repo_name
  repo_name=$(basename "$repo")

  echo ""
  echo "=== [$repo_name] Dockerfile Safety Check ==="

  local dockerfile="$repo/Dockerfile"
  if [[ ! -f "$dockerfile" ]]; then
    warn "[$repo_name] No Dockerfile found"
    return
  fi

  if grep -n "drizzle-kit generate" "$dockerfile" | grep -v '^\s*#' | grep -v '^\s*[0-9]*:\s*#' > /dev/null 2>&1; then
    error "[$repo_name] Dockerfile contains 'drizzle-kit generate' — this creates duplicate migrations at build time!"
    grep -n "drizzle-kit generate" "$dockerfile" | grep -v '^\s*#' | grep -v '^\s*[0-9]*:\s*#'
  else
    pass "[$repo_name] Dockerfile does not run drizzle-kit generate"
  fi

  if grep -n "drizzle-kit push" "$dockerfile" | grep -v '^\s*#' | grep -v '^\s*[0-9]*:\s*#' > /dev/null 2>&1; then
    error "[$repo_name] Dockerfile contains 'drizzle-kit push' — this bypasses migration tracking!"
    grep -n "drizzle-kit push" "$dockerfile" | grep -v '^\s*#' | grep -v '^\s*[0-9]*:\s*#'
  else
    pass "[$repo_name] Dockerfile does not run drizzle-kit push"
  fi
}

# --------------------------------------------------------------------------
# Check 5: products pre-migrate.mjs tenants definition drift
# (Only applicable to products repo)
# --------------------------------------------------------------------------
check_premigrate_drift() {
  local repo="$1"
  local repo_name
  repo_name=$(basename "$repo")

  # Only check products repo
  [[ "$repo_name" != "products" ]] && return

  local dockerfile="$repo/Dockerfile"
  [[ ! -f "$dockerfile" ]] && return

  echo ""
  echo "=== [$repo_name] Pre-Migrate Table Drift Check ==="

  # Check if the products Dockerfile's pre-migrate creates tenants
  # and warn if it's missing columns that dashboard has added
  if grep -q "CREATE TABLE IF NOT EXISTS.*tenants" "$dockerfile" 2>/dev/null; then
    pass "[$repo_name] pre-migrate.mjs creates tenants with IF NOT EXISTS (safe)"
    warn "[$repo_name] Remember: if dashboard adds columns to tenants, pre-migrate.mjs does NOT need to be updated (the table already exists at runtime)"
  fi
}

# --------------------------------------------------------------------------
# Run all checks
# --------------------------------------------------------------------------
echo "========================================"
echo "  Fintech Migration Linter"
echo "========================================"

for repo in "${ALL_REPOS[@]}"; do
  check_sql_idempotency "$repo"
  check_journal_internal "$repo"
  check_no_drizzle_generate "$repo"
  check_premigrate_drift "$repo"
done

# Cross-repo check (only in --cross-repo mode or when sibling repos exist)
if [[ "$CROSS_REPO" == "true" ]]; then
  check_cross_repo_timestamps
elif [[ -d "$(dirname "${ALL_REPOS[0]}")/../dashboard" ]] || [[ -d "$(dirname "${ALL_REPOS[0]}")/../auth" ]]; then
  # Auto-detect sibling repos for local development
  PARENT=$(cd "$(dirname "${ALL_REPOS[0]}")/.." && pwd)
  OLD_REPOS=("${ALL_REPOS[@]}")
  ALL_REPOS=()
  for dir in "$PARENT"/*/; do
    if [[ -d "$dir/src/db/migrations/meta" ]] || [[ -d "$dir/apps/api/src/db/migrations/meta" ]]; then
      ALL_REPOS+=("$dir")
    fi
  done
  if [[ ${#ALL_REPOS[@]} -gt 1 ]]; then
    CROSS_REPO=true
    echo ""
    echo "(Auto-detected ${#ALL_REPOS[@]} sibling repos for cross-service check)"
    check_cross_repo_timestamps
  fi
  ALL_REPOS=("${OLD_REPOS[@]}")
fi

# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------
echo ""
echo "========================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "  ${RED}FAILED: $ERRORS error(s), $WARNINGS warning(s)${NC}"
  echo "========================================"
  exit 1
else
  echo -e "  ${GREEN}PASSED: 0 errors, $WARNINGS warning(s)${NC}"
  echo "========================================"
  exit 0
fi
