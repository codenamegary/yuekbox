#!/bin/sh
# Local test for scripts/install.sh (#56).
#
# Serves a fake `yuekbox-linux-x64` plus its SHA-256 over a throwaway HTTP
# server and drives the installer through the YUEKBOX_BASE_URL override. No
# release, no GitHub, no network, no GPU:
#
#   sh scripts/install.test.sh
#
# Covers the happy path (download, checksum, install, next steps), a checksum
# mismatch (nothing installed, an existing binary left alone), platform refusal
# (macOS, non-x86_64), and the release URL for a pinned version and latest.
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
installer="$repo_root/scripts/install.sh"

work="$(mktemp -d "${TMPDIR:-/tmp}/yuekbox-install-test.XXXXXX")"
server_pid=""

cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM

fail() {
  printf '\nFAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'ok: %s\n' "$1"
}

make_checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$1" && sha256sum yuekbox-linux-x64 > yuekbox-linux-x64.sha256)
  else
    (cd "$1" && shasum -a 256 yuekbox-linux-x64 > yuekbox-linux-x64.sha256)
  fi
}

[ -f "$installer" ] || fail "missing $installer"

# ---- fixtures -----------------------------------------------------------------

serve_dir="$work/serve"
mkdir -p "$serve_dir" "$work/tmp" "$work/tmp-v" "$work/bin"
cat > "$serve_dir/yuekbox-linux-x64" <<'FAKE'
#!/bin/sh
printf 'fake yuekbox\n'
FAKE
make_checksum "$serve_dir"

# ---- throwaway HTTP server ----------------------------------------------------

port="$(python3 -c 'import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()')"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$serve_dir" >"$work/http.log" 2>&1 &
server_pid=$!
base="http://127.0.0.1:$port"

ready=0
for _ in $(seq 1 50); do
  if curl -fsS "$base/yuekbox-linux-x64.sha256" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
[ "$ready" -eq 1 ] || fail "the test HTTP server did not start (see $work/http.log)"

# ---- happy path ---------------------------------------------------------------

printf '\n== happy path ==\n'
install_dir="$work/bin"
log="$work/install.log"
if ! YUEKBOX_BASE_URL="$base" YUEKBOX_INSTALL_DIR="$install_dir" TMPDIR="$work/tmp" \
  sh "$installer" >"$log" 2>&1; then
  cat "$log" >&2
  fail "the installer exited non-zero"
fi
[ -x "$install_dir/yuekbox" ] || fail "yuekbox was not installed executable"
[ "$("$install_dir/yuekbox")" = "fake yuekbox" ] || fail "the installed file is not the served binary"
grep -q "yuekbox --provision" "$log" || fail "the next-step hint for --provision is missing"
[ -z "$(ls -A "$work/tmp")" ] || fail "the installer left temp files behind: $(ls -A "$work/tmp")"
pass "downloads, verifies, installs, and cleans up"

# ---- checksum mismatch --------------------------------------------------------

printf '\n== checksum mismatch ==\n'
printf '%064d  yuekbox-linux-x64\n' 0 > "$serve_dir/yuekbox-linux-x64.sha256"
printf 'do not replace me\n' > "$install_dir/yuekbox"
if YUEKBOX_BASE_URL="$base" YUEKBOX_INSTALL_DIR="$install_dir" TMPDIR="$work/tmp" \
  sh "$installer" >"$work/mismatch.log" 2>&1; then
  fail "the installer accepted a bad checksum"
fi
grep -qi "checksum mismatch" "$work/mismatch.log" ||
  fail "the checksum failure was not named: $(cat "$work/mismatch.log")"
[ "$(cat "$install_dir/yuekbox")" = "do not replace me" ] ||
  fail "a failed install replaced the installed binary"
[ -z "$(ls -A "$work/tmp")" ] || fail "a failed install left temp files behind"
make_checksum "$serve_dir"
pass "fails loudly on a checksum mismatch and installs nothing"

# ---- download failure ---------------------------------------------------------

printf '\n== download failure ==\n'
mkdir -p "$work/bin-404"
if YUEKBOX_BASE_URL="$base/does-not-exist" YUEKBOX_INSTALL_DIR="$work/bin-404" TMPDIR="$work/tmp" \
  sh "$installer" >"$work/404.log" 2>&1; then
  fail "the installer accepted a missing asset"
fi
grep -q "could not download" "$work/404.log" || fail "the download failure was not named: $(cat "$work/404.log")"
[ ! -e "$work/bin-404/yuekbox" ] || fail "a failed download installed a binary"
[ -z "$(ls -A "$work/tmp")" ] || fail "a failed download left temp files behind"
pass "fails loudly when an asset is missing"

# ---- platform refusal ---------------------------------------------------------

printf '\n== platform refusal ==\n'
shim="$work/shim"
mkdir -p "$shim"
cat > "$shim/uname" <<'SHIM'
#!/bin/sh
case "$1" in
  -m) printf '%s\n' "${FAKE_UNAME_M:-x86_64}" ;;
  *) printf '%s\n' "${FAKE_UNAME_S:-Linux}" ;;
esac
SHIM
chmod +x "$shim/uname"

if PATH="$shim:$PATH" FAKE_UNAME_S=Darwin YUEKBOX_INSTALL_DIR="$work/bin-mac" \
  sh "$installer" >"$work/mac.log" 2>&1; then
  fail "the installer accepted macOS"
fi
grep -qi "macOS" "$work/mac.log" || fail "the macOS refusal does not say macOS: $(cat "$work/mac.log")"

if PATH="$shim:$PATH" FAKE_UNAME_M=aarch64 YUEKBOX_INSTALL_DIR="$work/bin-arm" \
  sh "$installer" >"$work/arm.log" 2>&1; then
  fail "the installer accepted aarch64"
fi
grep -q "x86_64" "$work/arm.log" || fail "the arm64 refusal does not name x86_64: $(cat "$work/arm.log")"
pass "refuses macOS and non-x86_64 with a clear message"

# ---- release URLs -------------------------------------------------------------

printf '\n== release URLs ==\n'
curl_shim="$work/curl-shim"
mkdir -p "$curl_shim"
cat > "$curl_shim/curl" <<'SHIM'
#!/bin/sh
url=""
dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o)
      dest="$2"
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
printf '%s\n' "$url" >> "$CURL_LOG"
name="${url##*/}"
if [ -f "$FIXTURES/$name" ]; then
  cp "$FIXTURES/$name" "$dest"
  exit 0
fi
exit 22
SHIM
chmod +x "$curl_shim/curl"

urls_pinned="$work/urls-pinned.log"
: > "$urls_pinned"
if ! PATH="$curl_shim:$PATH" CURL_LOG="$urls_pinned" FIXTURES="$serve_dir" \
  YUEKBOX_VERSION=0.3.0 YUEKBOX_INSTALL_DIR="$work/bin-v" TMPDIR="$work/tmp-v" \
  sh "$installer" >"$work/version.log" 2>&1; then
  cat "$work/version.log" >&2
  fail "pinned-version install failed under the curl shim"
fi
grep -qx "https://github.com/codenamegary/yuekbox/releases/download/v0.3.0/yuekbox-linux-x64" "$urls_pinned" ||
  fail "pinned-version URL is wrong: $(cat "$urls_pinned")"
grep -qx "https://github.com/codenamegary/yuekbox/releases/download/v0.3.0/yuekbox-linux-x64.sha256" "$urls_pinned" ||
  fail "pinned-version checksum URL is wrong: $(cat "$urls_pinned")"

urls_latest="$work/urls-latest.log"
: > "$urls_latest"
if ! PATH="$curl_shim:$PATH" CURL_LOG="$urls_latest" FIXTURES="$serve_dir" \
  YUEKBOX_INSTALL_DIR="$work/bin-latest" TMPDIR="$work/tmp-v" \
  sh "$installer" >"$work/latest.log" 2>&1; then
  cat "$work/latest.log" >&2
  fail "latest install failed under the curl shim"
fi
grep -qx "https://github.com/codenamegary/yuekbox/releases/latest/download/yuekbox-linux-x64" "$urls_latest" ||
  fail "latest URL is wrong: $(cat "$urls_latest")"
pass "builds the pinned and latest release URLs"

printf '\n== install test passed ==\n'
