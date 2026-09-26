#!/usr/bin/env bash
# Tests scripts/release-notes-append.sh with a gh shim (#56): the packaging
# section is appended to an existing release body exactly once, and a rerun
# leaves the body byte-for-byte alone.
#
#   bash scripts/release-notes.test.sh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
script="$repo_root/scripts/release-notes-append.sh"
notes="$repo_root/.github/release-notes-packaging.md"

work="$(mktemp -d "${TMPDIR:-/tmp}/yuekbox-release-notes-test.XXXXXX")"
trap 'rm -rf "$work"' EXIT

fail() {
  printf '\nFAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'ok: %s\n' "$1"
}

[[ -f "$script" ]] || fail "missing $script"
[[ -f "$notes" ]] || fail "missing $notes"

# ---- gh shim ------------------------------------------------------------------

shim="$work/shim"
mkdir -p "$shim"
cat >"$shim/gh" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail

command="$1"
action="$2"
shift 2

case "$command $action" in
  "release view")
    cat "$GH_RELEASE_BODY"
    ;;
  "release edit")
    notes_file=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --notes-file)
          notes_file="$2"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ -n "$notes_file" ]] || {
      echo "shim: expected --notes-file" >&2
      exit 1
    }
    cp "$notes_file" "$GH_RELEASE_BODY"
    ;;
  *)
    echo "shim: unexpected gh call: $command $action" >&2
    exit 1
    ;;
esac
SHIM
chmod +x "$shim/gh"

# ---- append once --------------------------------------------------------------

body="$work/body.md"
cat >"$body" <<'BODY'
## [0.3.0](https://github.com/codenamegary/yuekbox/releases/tag/v0.3.0)

* a change worth releasing
BODY

GH_RELEASE_BODY="$body" PATH="$shim:$PATH" bash "$script" v0.3.0 >"$work/first.log" 2>&1 ||
  fail "the first append failed: $(cat "$work/first.log")"

grep -q "a change worth releasing" "$body" || fail "the original body was lost"
grep -q "^## Prebuilt binary$" "$body" || fail "the packaging heading is missing"
grep -q "does not bundle" "$body" || fail "the bundle statement is missing"
marker_count="$(grep -cF '<!-- yuekbox-packaging -->' "$body")"
[[ "$marker_count" -eq 1 ]] || fail "the marker appears $marker_count times"
pass "appends the packaging section to the release body"

# ---- rerun is a no-op ---------------------------------------------------------

cp "$body" "$work/before.md"
GH_RELEASE_BODY="$body" PATH="$shim:$PATH" bash "$script" v0.3.0 >"$work/second.log" 2>&1 ||
  fail "the second append failed: $(cat "$work/second.log")"
cmp -s "$work/before.md" "$body" || fail "a rerun changed the release body"
grep -q "unchanged" "$work/second.log" || fail "the rerun did not report that the body was unchanged"
pass "a rerun leaves the release body alone"

# ---- missing tag --------------------------------------------------------------

if GH_RELEASE_BODY="$body" PATH="$shim:$PATH" bash "$script" >"$work/no-tag.log" 2>&1; then
  fail "the script accepted a missing tag"
fi
grep -q "usage:" "$work/no-tag.log" || fail "the missing-tag failure prints no usage"
pass "requires a tag"

printf '\n== release notes test passed ==\n'
