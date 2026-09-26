#!/usr/bin/env bash
# Appends the fixed packaging section to a GitHub release body, once (#56).
#
# release-please owns the release notes, so this never rewrites them: it reads
# the current body, appends .github/release-notes-packaging.md when the marker
# is absent, and leaves the body alone when it is present. Re-running is safe.
#
#   scripts/release-notes-append.sh <tag> [notes-file]
#
# Requires `gh` with contents:write (the release workflow passes GH_TOKEN).
set -euo pipefail

tag="${1:-}"
if [[ -z "$tag" ]]; then
  echo "usage: $0 <tag> [notes-file]" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
notes="${2:-$repo_root/.github/release-notes-packaging.md}"
marker="<!-- yuekbox-packaging -->"

if [[ ! -f "$notes" ]]; then
  echo "notes file not found: $notes" >&2
  exit 2
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

gh release view "$tag" --json body --jq .body >"$body_file"

if grep -qF "$marker" "$body_file"; then
  echo "release $tag already carries $marker; the body is unchanged"
  exit 0
fi

printf '\n' >>"$body_file"
cat "$notes" >>"$body_file"
gh release edit "$tag" --notes-file "$body_file"
echo "appended the packaging note to release $tag"
