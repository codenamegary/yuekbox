#!/bin/sh
# yuekbox installer (#56).
#
#   curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh | sh
#
# Downloads the prebuilt linux-x64 executable, verifies its SHA-256, and
# installs it to ${YUEKBOX_INSTALL_DIR:-$HOME/.local/bin}.
#
# Environment:
#   YUEKBOX_INSTALL_DIR  where the `yuekbox` executable lands (default: ~/.local/bin)
#   YUEKBOX_VERSION      release tag to install, `0.3.0` or `v0.3.0`
#                        (default: the latest release)
#   YUEKBOX_BASE_URL     download base for the binary and checksum; for tests
#                        and mirrors only (default: the GitHub release)
#
# The executable is a launcher and a web app: it bundles the UI, the API, the
# SQLite schema, and the Python helper scripts. It does NOT bundle CUDA,
# PyTorch, Python, ffmpeg, or model weights. Those stay a machine prerequisite
# and a runtime download: `yuekbox --provision` builds the Python runtime under
# ~/.yuekbox, and the app downloads the models (or points ~/.yuekbox/config.yaml
# at existing copies). An NVIDIA GPU with a recent driver and ffmpeg with
# libmp3lame are still required.
#
# Everything runnable lives inside main(), which is called on the last line.
# A cut-off `curl | sh` delivers a partial script whose last line never
# arrives, so at worst the shell defines functions and exits.
set -eu

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'yuekbox installer: %s\n' "$*" >&2
  exit 1
}

main() {
  repo="codenamegary/yuekbox"
  asset="yuekbox-linux-x64"
  tmp_prefix="yuekbox-install"

  # ---- platform ---------------------------------------------------------------

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux) ;;
    Darwin)
      fail "macOS is not supported. yuekbox needs a local NVIDIA GPU, so Linux and WSL2 only."
      ;;
    *)
      fail "unsupported operating system: $os. yuekbox supports Linux and WSL2 with an NVIDIA GPU only."
      ;;
  esac

  case "$arch" in
    x86_64 | amd64) ;;
    *)
      fail "unsupported architecture: $arch. The prebuilt yuekbox binary is x86_64 only. Build from source instead: https://github.com/$repo"
      ;;
  esac

  # ---- release and download base ----------------------------------------------

  version="${YUEKBOX_VERSION:-latest}"
  case "$version" in
    latest | "") version="latest" ;;
    v*) ;;
    *) version="v$version" ;;
  esac

  base_url="${YUEKBOX_BASE_URL:-}"
  if [ -z "$base_url" ]; then
    if [ "$version" = "latest" ]; then
      base_url="https://github.com/$repo/releases/latest/download"
    else
      base_url="https://github.com/$repo/releases/download/$version"
    fi
  fi
  while [ "${base_url%/}" != "$base_url" ]; do
    base_url="${base_url%/}"
  done

  # ---- install dir ------------------------------------------------------------

  install_dir="${YUEKBOX_INSTALL_DIR:-}"
  if [ -z "$install_dir" ]; then
    if [ -z "${HOME:-}" ]; then
      fail "HOME is not set; set YUEKBOX_INSTALL_DIR to choose where yuekbox lands."
    fi
    install_dir="$HOME/.local/bin"
  fi

  # ---- temp dir ---------------------------------------------------------------

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/$tmp_prefix.XXXXXX")" ||
    fail "could not create a temp directory under ${TMPDIR:-/tmp}"
  cleanup() {
    rm -rf "$tmp_dir"
  }
  # A signal stops the install: run the EXIT cleanup by exiting nonzero.
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # ---- download helpers -------------------------------------------------------

  download() {
    url="$1"
    destination="$2"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$url" -o "$destination"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$destination" "$url"
    else
      fail "neither curl nor wget is installed; install one and rerun."
    fi
  }

  sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$1" | cut -d ' ' -f 1
    elif command -v shasum >/dev/null 2>&1; then
      shasum -a 256 "$1" | cut -d ' ' -f 1
    else
      fail "neither sha256sum nor shasum is installed; cannot verify the download."
    fi
  }

  # ---- download and verify ----------------------------------------------------

  say "Downloading yuekbox ($version) for linux-x64..."
  download "$base_url/$asset" "$tmp_dir/$asset" ||
    fail "could not download $base_url/$asset. Check the machine's network and that the release has the asset."
  download "$base_url/$asset.sha256" "$tmp_dir/$asset.sha256" ||
    fail "could not download the checksum at $base_url/$asset.sha256."

  expected="$(cut -d ' ' -f 1 <"$tmp_dir/$asset.sha256")"
  actual="$(sha256_of "$tmp_dir/$asset")"
  if [ "$expected" != "$actual" ]; then
    fail "checksum mismatch for $asset: expected $expected, got $actual. Nothing was installed."
  fi

  # ---- install ----------------------------------------------------------------

  mkdir -p "$install_dir" || fail "could not create $install_dir"
  chmod +x "$tmp_dir/$asset"
  mv "$tmp_dir/$asset" "$install_dir/yuekbox" || fail "could not install to $install_dir/yuekbox"
  chmod +x "$install_dir/yuekbox"

  say "Installed yuekbox to $install_dir/yuekbox"
  case ":${PATH:-}:" in
    *":$install_dir:"*) ;;
    *)
      say "Add it to your PATH: export PATH=\"$install_dir:\$PATH\""
      ;;
  esac

  say ""
  say "Next:"
  say "  yuekbox --provision   one-time setup: builds the Python runtime under ~/.yuekbox"
  say "  yuekbox               starts the app at http://127.0.0.1:3000"
  say ""
  say "Still required on this machine: an NVIDIA GPU with a recent driver, ffmpeg"
  say "with libmp3lame, and network access for --provision and the model downloads."
  say "The binary bundles no CUDA, PyTorch, or model weights. See the README:"
  say "https://github.com/$repo#-install-a-release-no-bun-no-checkout"
}

main "$@"
