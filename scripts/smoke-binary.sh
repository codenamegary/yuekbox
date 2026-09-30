#!/usr/bin/env bash
# Compiled-artifact smoke test for the single `yuekbox` executable (#52, #78).
#
# It builds nothing itself. Point it at a binary:
#
#   bun run build:binary
#   ./scripts/smoke-binary.sh ./yuekbox
#
# The binary runs against a scratch home and an empty working directory, which
# proves it needs no source tree and no node_modules. Checks: the daemon
# detaches on `start` (the parent returns to the prompt), /v1/status over the
# public listener, /v1/config precedence (CLI flag > config.yaml > home
# default), one extracted Python helper, `status`/`stop` against the running
# instance, and `uninstall --purge` removing the home and the binary copy.
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "usage: $0 [path-to-yuekbox]" >&2
  exit 2
fi

bin_input="${1:-./yuekbox}"
if [[ ! -x "$bin_input" ]]; then
  echo "not executable: $bin_input (run: bun run build:binary)" >&2
  exit 2
fi
bin="$(cd "$(dirname "$bin_input")" && pwd)/$(basename "$bin_input")"

scratch="$(mktemp -d "${TMPDIR:-/tmp}/yuekbox-smoke.XXXXXX")"
# Canonicalize before any path is compared against binary output: macOS sets
# TMPDIR with a trailing slash, so `$scratch` would carry a `//` the binary's
# printed paths never have (and `pwd -P` also clears symlinks like /tmp).
scratch="$(cd "$scratch" && pwd -P)"
# Run a copy from the scratch dir so the test proves the artifact is
# self-contained: no source tree, no node_modules, nothing beside it.
cp "$bin" "$scratch/yuekbox"
bin="$scratch/yuekbox"
home="$scratch/home"
web_port="${YUEKBOX_SMOKE_PORT:-3391}"
base="http://127.0.0.1:$web_port"
log="$scratch/smoke.log"

cleanup() {
  "$bin" --home "$home" stop >/dev/null 2>&1 || true
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

mkdir -p "$home" "$scratch/empty" "$scratch/fake-home" "$scratch/flag" "$scratch/yaml"
cat > "$home/config.yaml" <<YAML
models:
  yue2: $scratch/yaml/YuE2-3B
  whisper: $scratch/yaml/whisper-large-v3-turbo
YAML

echo "== start (detached) =="
pushd "$scratch/empty" >/dev/null
HOME="$scratch/fake-home" WEB_PORT="$web_port" \
  "$bin" --home "$home" --yue2-model "$scratch/flag/YuE2-3B" >"$log" 2>&1
start_code=$?
popd >/dev/null
[[ "$start_code" -eq 0 ]] || fail "start exited with $start_code"
grep -q "yuekbox started" "$log" || fail "start did not report success: $(cat "$log")"
pid="$(sed -n 's/^yuekbox started (pid \([0-9][0-9]*\))$/\1/p' "$log")"
[[ -n "$pid" ]] || fail "start printed no pid: $(cat "$log")"
grep -q "^  url   $base$" "$log" || fail "start printed no url: $(cat "$log")"
grep -q "^  log   $home/logs/yuekbox.log$" "$log" || fail "start printed no log path: $(cat "$log")"
echo "start -> detached pid $pid"

# The parent has returned to the prompt; the daemon child must be alive.
kill -0 "$pid" 2>/dev/null || fail "the daemon child (pid $pid) is not running"
echo "kill -0 $pid -> alive"

echo "== status --json =="
status_json="$("$bin" --home "$home" status --json 2>"$log")"
status_code=$?
[[ "$status_code" -eq 0 ]] || fail "status --json exited with $status_code: $status_json"
grep -q '"state": "running"' <<<"$status_json" || fail "status --json was not running: $status_json"
grep -q "\"pid\": $pid" <<<"$status_json" || fail "status --json reported the wrong pid: $status_json"
grep -q "\"url\": \"$base\"" <<<"$status_json" || fail "status --json printed no url: $status_json"
grep -q '"logPath"' <<<"$status_json" || fail "status --json printed no logPath: $status_json"

echo "== idempotent start =="
idempotent="$("$bin" --home "$home" start 2>"$log")"
idempotent_code=$?
[[ "$idempotent_code" -eq 0 ]] || fail "second start exited with $idempotent_code"
grep -q "yuekbox is already running (pid $pid)" <<<"$idempotent" ||
  fail "second start was not idempotent: $idempotent"

echo "== UI =="
ui="$(curl -fsS "$base/")"
grep -q 'id="root"' <<<"$ui" || fail "GET / did not return the SPA shell"
echo 'GET / -> 200 with the SPA shell'

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

echo "== embedded helper =="
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
grep -q "removed $bin" <<<"$uninstall" || fail "uninstall did not remove the binary copy: $uninstall"
[[ ! -e "$home" ]] || fail "the home still exists after --purge"
[[ ! -e "$bin" ]] || fail "the binary copy still exists after --purge"
echo "uninstall --purge -> home and binary gone"

echo
echo "== binary smoke test passed =="
