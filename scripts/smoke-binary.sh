#!/usr/bin/env bash
# Compiled-artifact smoke test for the single `yuekbox` executable (#52).
#
# It builds nothing itself. Point it at a binary:
#
#   bun run build:binary
#   ./scripts/smoke-binary.sh ./yuekbox
#
# The binary runs against a scratch home and an empty working directory, which
# proves it needs no source tree and no node_modules. Checks: the SPA shell,
# /v1/status, /v1/config precedence (CLI flag > config.yaml > home default),
# one extracted Python helper, and a clean SIGTERM stop.
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
# Run a copy from the scratch dir so the test proves the artifact is
# self-contained: no source tree, no node_modules, nothing beside it.
cp "$bin" "$scratch/yuekbox"
bin="$scratch/yuekbox"
home="$scratch/home"
web_port="${YUEKBOX_SMOKE_PORT:-3391}"
base="http://127.0.0.1:$web_port"
log="$scratch/binary.log"
pid=""

cleanup() {
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  echo "---- binary log ----" >&2
  cat "$log" >&2 || true
  exit 1
}

mkdir -p "$home" "$scratch/empty" "$scratch/fake-home" "$scratch/flag" "$scratch/yaml"
cat > "$home/config.yaml" <<YAML
models:
  yue2: $scratch/yaml/YuE2-3B
  whisper: $scratch/yaml/whisper-large-v3-turbo
YAML

echo "== start =="
pushd "$scratch/empty" >/dev/null
HOME="$scratch/fake-home" WEB_PORT="$web_port" \
  "$bin" --home "$home" --yue2-model "$scratch/flag/YuE2-3B" >"$log" 2>&1 &
pid=$!
popd >/dev/null

ready=0
for _ in $(seq 1 100); do
  if curl -fsS "$base/v1/status" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid" 2>/dev/null || true
    pid=""
    fail "the binary exited before serving /v1/status"
  fi
  sleep 0.3
done
[[ "$ready" -eq 1 ]] || fail "timed out waiting for $base/v1/status"

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
kill -TERM "$pid"
stopped=0
for _ in $(seq 1 40); do
  if ! kill -0 "$pid" 2>/dev/null; then
    stopped=1
    break
  fi
  sleep 0.25
done
if [[ "$stopped" -ne 1 ]]; then
  kill -9 "$pid" 2>/dev/null || true
  pid=""
  fail "the binary did not stop on SIGTERM"
fi
set +e
wait "$pid"
exit_code=$?
set -e
pid=""
[[ "$exit_code" -eq 0 ]] || fail "the binary exited with $exit_code after SIGTERM"
echo "SIGTERM -> clean exit"

echo
echo "== binary smoke test passed =="
