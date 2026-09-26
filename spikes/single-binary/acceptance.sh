#!/usr/bin/env bash
# Throwaway acceptance runner for issue #51. Never touches the real ~/.yuekbox.
set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/v22.17.0/bin:$PATH"

root="$(cd "$(dirname "$0")/../.." && pwd)"
scratch="${SPIKE_SCRATCH:-/tmp/opencode/yuekbox-spike}"
bin="$scratch/yuekbox-spike"
home="$scratch/accept-home"

echo "== build =="
rm -rf "$home"
mkdir -p "$home" "$scratch/fakebin"
cat > "$home/config.yaml" <<YAML
models:
  yue2: $scratch/models/YuE2-3B
  yue2Vae: $scratch/models/YuE2-Vae
  sheetsage2: $scratch/models/SheetSage2
  sheetsage2Base: $scratch/models/MERT-v2-FullSong
  whisper: $scratch/models/whisper-large-v3-turbo
YAML
(cd "$root" && bun spikes/single-binary/build.ts "$bin")

echo
echo "== starts, serves UI, /v1/status, reads config.yaml, execs embedded python =="
mkdir -p "$scratch/empty"
(cd "$scratch/empty" && \
  HOME="$scratch" USER=spike SPIKE_SELF_TEST=1 PORT=8891 WEB_PORT=3391 \
  "$bin" --home "$home" > "$scratch/accept-run.log" 2>&1)
grep -E '\[spike\] (web listening|installed 5|exec python3)|"statusCode"|"configCode"|"uiCode"|"state"' "$scratch/accept-run.log"

echo
echo "== default home is \$HOME/.yuekbox =="
mkdir -p "$scratch/safehome/.yuekbox"
cp "$home/config.yaml" "$scratch/safehome/.yuekbox/config.yaml"
(cd "$scratch/empty" && \
  HOME="$scratch/safehome" USER=spike SPIKE_SELF_TEST=1 PORT=8895 WEB_PORT=3395 \
  "$bin" > "$scratch/accept-defaulthome.log" 2>&1)
grep -q "$scratch/safehome/.yuekbox/config.yaml" "$scratch/accept-defaulthome.log"
echo "default home resolved to \$HOME/.yuekbox"

echo
echo "== CLI flag override beats config.yaml =="
(cd "$scratch/empty" && \
  HOME="$scratch" USER=spike SPIKE_SELF_TEST=1 PORT=8892 WEB_PORT=3392 \
  "$bin" --home "$home" --yue2-model /override/YuE2 > "$scratch/accept-flags.log" 2>&1)
grep -q '"/override/YuE2"' "$scratch/accept-flags.log"
grep -q "$scratch/models/SheetSage2" "$scratch/accept-flags.log"
echo "override yue2=/override/YuE2 and yaml sheetsage2=$scratch/models/SheetSage2 both present"

echo
echo "== --config moves the file (empty home, config elsewhere) =="
mkdir -p "$scratch/accept-home3"
(cd "$scratch/empty" && \
  HOME="$scratch" USER=spike SPIKE_SELF_TEST=1 PORT=8894 WEB_PORT=3394 \
  "$bin" --home "$scratch/accept-home3" --config "$home/config.yaml" > "$scratch/accept-configflag.log" 2>&1)
grep -q "$scratch/models/whisper-large-v3-turbo" "$scratch/accept-configflag.log"
echo "config from --config file resolved under a different home"

echo
echo "== --provision trigger with a fake uv (no downloads, stops at first failure) =="
printf '#!/bin/sh\nexit 42\n' > "$scratch/fakebin/uv"
chmod +x "$scratch/fakebin/uv"
set +e
(cd "$scratch/empty" && \
  HOME="$scratch" USER=spike PATH="$scratch/fakebin:$PATH" \
  "$bin" --home "$home" --provision > "$scratch/accept-provision.log" 2>&1)
provision_exit=$?
set -e
cat "$scratch/accept-provision.log"
test "$provision_exit" -eq 1
grep -q "could not install the song engine" "$scratch/accept-provision.log"

echo
echo "== all acceptance checks passed =="
