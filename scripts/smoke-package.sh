#!/usr/bin/env bash
# Tarball smoke test for the npm package (#99).
#
# It builds nothing itself. Point it at a packed tarball:
#
#   bun run build:package
#   (cd dist/yuekbox && npm pack)
#   ./scripts/smoke-package.sh dist/yuekbox/yuekbox-*.tgz
#
# The tarball installs globally into a scratch prefix, which proves the
# published artifact is self-contained: no source tree, no node_modules, and
# the `yuekbox` bin runs under bun via its shebang, exactly as `npx yuekbox`
# would. Checks mirror smoke-binary.sh: detached `start`, /v1/status,
# /v1/config precedence, one extracted Python helper, `status`/`stop`, and
# `uninstall --purge` removing the home and the bin symlink — never the bun
# runtime itself.
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "usage: $0 [path-to-yuekbox-tgz]" >&2
  exit 2
fi

tgz_input="${1:-dist/yuekbox/yuekbox-*.tgz}"
tgz="$(compgen -G "$tgz_input" | head -1 || true)"
if [[ -z "$tgz" ]]; then
  echo "no tarball matches: $tgz_input (run: bun run build:package && cd dist/yuekbox && npm pack)" >&2
  exit 2
fi
tgz="$(cd "$(dirname "$tgz")" && pwd)/$(basename "$tgz")"

command -v npm >/dev/null || { echo "npm is required to install the tarball" >&2; exit 2; }
command -v bun >/dev/null || { echo "bun must be on PATH (the bin runs under bun)" >&2; exit 2; }

scratch="$(mktemp -d "${TMPDIR:-/tmp}/yuekbox-pkg-smoke.XXXXXX")"
scratch="$(cd "$scratch" && pwd -P)"
prefix="$scratch/npm"
home="$scratch/home"
web_port="${YUEKBOX_SMOKE_PORT:-3391}"
base="http://127.0.0.1:$web_port"
log="$scratch/smoke.log"

cleanup() {
  "$prefix/bin/yuekbox" --home "$home" stop >/dev/null 2>&1 || true
  npm uninstall -g --prefix "$prefix" yuekbox >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  echo "---- smoke log ----" >&2
  cat "$log" >&2 || true
  echo "---- server log ----" >&2
  cat "$home/logs/yuekbox.log" >&2 || true
  exit 1
}

mkdir -p "$home" "$scratch/empty"
cat > "$home/config.yaml" <<YAML
models:
  yue2: $scratch/yaml/YuE2-3B
  whisper: $scratch/yaml/whisper-large-v3-turbo
YAML

echo "== npm install -g =="
npm install -g --prefix "$prefix" "$tgz" >"$log" 2>&1 ||
  fail "npm install -g failed: $(cat "$log")"
bin_link="$prefix/bin/yuekbox"
[[ -L "$bin_link" ]] || fail "the yuekbox bin is not a symlink: $bin_link"
bin_target="$(readlink -f "$bin_link")"
grep -q "^#!/usr/bin/env bun$" "$bin_target" ||
  fail "the bin target has no bun shebang: $(head -1 "$bin_target")"
echo "installed -> $bin_link -> $bin_target"

# Drive the installed symlink, not the tarball contents: the test proves the
# published artifact works exactly as `npm i -g yuekbox` users will run it.
bin="$bin_link"
start_code=0

echo "== start (detached) =="
pushd "$scratch/empty" >/dev/null
HOME="$scratch/fake-home" WEB_PORT="$web_port" \
  "$bin" --home "$home" --yue2-model "$scratch/flag/YuE2-3B" >"$log" 2>&1 || start_code=$?
start_code="${start_code:-0}"
popd >/dev/null
[[ "$start_code" -eq 0 ]] || fail "start exited with $start_code"
grep -q "yuekbox started" "$log" || fail "start did not report success: $(cat "$log")"
pid="$(sed -n 's/^yuekbox started (pid \([0-9][0-9]*\))$/\1/p' "$log")"
[[ -n "$pid" ]] || fail "start printed no pid: $(cat "$log")"
grep -q "^  url   $base$" "$log" || fail "start printed no url: $(cat "$log")"
echo "start -> detached pid $pid"

kill -0 "$pid" 2>/dev/null || fail "the daemon child (pid $pid) is not running"
echo "kill -0 $pid -> alive"

echo "== status --json =="
status_json="$("$bin" --home "$home" status --json 2>"$log")"
status_code=$?
[[ "$status_code" -eq 0 ]] || fail "status --json exited with $status_code: $status_json"
grep -q '"state": "running"' <<<"$status_json" || fail "status --json was not running: $status_json"
grep -q "\"pid\": $pid" <<<"$status_json" || fail "status --json reported the wrong pid: $status_json"
grep -q "\"url\": \"$base\"" <<<"$status_json" || fail "status --json printed no url: $status_json"
echo "status --json -> running"

echo "== idempotent start =="
idempotent="$("$bin" --home "$home" start 2>"$log")"
idempotent_code=$?
[[ "$idempotent_code" -eq 0 ]] || fail "second start exited with $idempotent_code"
grep -q "yuekbox is already running (pid $pid)" <<<"$idempotent" ||
  fail "second start was not idempotent: $idempotent"
echo "second start -> idempotent"

echo "== UI =="
ui="$(curl -fsS "$base/")"
grep -q 'id="root"' <<<"$ui" || fail "GET / did not return the SPA shell"
echo 'GET / -> 200 with the SPA shell'

# The shell references hashed chunks relatively; a run from an unrelated cwd
# (as under npx) must still serve them from the package dir.
chunk="$(grep -o 'chunk-[A-Za-z0-9]*\.js' <<<"$ui" | head -1)"
[[ -n "$chunk" ]] || fail "the SPA shell references no chunk script"
chunk_status="$(curl -s -o /dev/null -w '%{http_code}' "$base/$chunk")"
[[ "$chunk_status" == 200 ]] || fail "GET /$chunk returned $chunk_status"
echo "GET /$chunk -> 200"

echo "== /v1/status =="
status="$(curl -fsS "$base/v1/status")"
grep -q '"state":"online"' <<<"$status" || fail "status was not online: $status"
echo "GET /v1/status -> $status"

echo "== /v1/config precedence =="
config="$(curl -fsS "$base/v1/config")"
grep -q "\"yue2\":\"$scratch/flag/YuE2-3B\"" <<<"$config" ||
  fail "the CLI flag did not override config.yaml: $config"
grep -q "\"whisper\":\"$scratch/yaml/whisper-large-v3-turbo\"" <<<"$config" ||
  fail "config.yaml was not read: $config"
grep -q "\"sheetsage2\":\"$home/models/SheetSage2\"" <<<"$config" ||
  fail "the home default was not used: $config"
echo "GET /v1/config -> flag > config.yaml > home default"

echo "== extracted helper =="
python3 "$home/scripts/generate.py" --help >"$scratch/help.log" 2>&1 ||
  fail "generate.py --help failed"
grep -qi "usage:" "$scratch/help.log" || fail "generate.py --help printed no usage"
echo "python3 $home/scripts/generate.py --help -> exit 0"

echo "== stop =="
stop="$("$bin" --home "$home" stop 2>"$log")"
stop_code=$?
[[ "$stop_code" -eq 0 ]] || fail "stop exited with $stop_code: $stop"
grep -q "waiting for pid $pid to exit…" <<<"$stop" || fail "stop printed no wait line: $stop"
grep -q "yuekbox stopped" <<<"$stop" || fail "stop did not confirm: $stop"
sleep 0.3
kill -0 "$pid" 2>/dev/null && fail "pid $pid is still alive after stop"
echo "stop -> daemon gone"

echo "== status after stop =="
set +e
stopped="$("$bin" --home "$home" status 2>"$log")"
stopped_code=$?
set -e
[[ "$stopped_code" -eq 3 ]] || fail "status after stop exited with $stopped_code (want 3): $stopped"
grep -q "yuekbox is not running" <<<"$stopped" || fail "status after stop printed the wrong line: $stopped"

echo "== uninstall --purge =="
uninstall="$("$bin" --home "$home" uninstall --purge 2>"$log")"
uninstall_code=$?
[[ "$uninstall_code" -eq 0 ]] || fail "uninstall --purge exited with $uninstall_code: $uninstall"
grep -q "removed $home" <<<"$uninstall" || fail "uninstall did not remove the home: $uninstall"
# Bun resolves the entry to its real path, so the installed server.js is
# what goes; the bin symlink dangles for npm uninstall to collect. The bun
# runtime itself is never a removal candidate.
grep -q "removed $bin_target" <<<"$uninstall" ||
  fail "uninstall did not remove the installed entry: $uninstall"
[[ ! -e "$home" ]] || fail "the home still exists after --purge"
[[ ! -e "$bin_target" ]] || fail "the installed entry still exists after --purge"
echo "uninstall --purge -> home and installed entry gone, bun runtime untouched"

echo
echo "== package smoke test passed =="
