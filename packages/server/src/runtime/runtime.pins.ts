/**
 * The pinned Python runtime, in one place.
 *
 * `yue2-infer` is not on PyPI. Provisioning installs it straight from the
 * repository at this commit:
 *
 * ```text
 * python -m pip install "yue2-infer @ git+https://github.com/multimodal-art-projection/YuE.git@<commit>"
 * ```
 *
 * To bump: update `version` and `commit` here, install into a fresh home, and
 * generate one Song end to end before landing. This is the only place the
 * installed runtime is pinned; the vendored script headers name their upstream
 * revision for attribution, and no code trusts a checkout.
 */
export const yue2RuntimePin = Object.freeze({
  package: "yue2-infer",
  version: "0.1.6",
  repository: "https://github.com/multimodal-art-projection/YuE.git",
  commit: "bd90e4ccae671d869b3ecaca6d7e893927d29442",
})
