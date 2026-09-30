/**
 * The pinned Python runtimes, in one place per platform.
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

/**
 * The macOS runtime: the native MLX port of the same YuE2-3B stack. Its
 * `lyra` pipeline subclasses the pinned upstream implementation, so the
 * request surface, the progress lines, and the artifact layout the vendored
 * scripts own are the reference code, not a reimplementation.
 *
 * Same bump discipline as `yue2-infer`: update `version` and `commit`
 * together, provision a fresh home on Apple Silicon (the darwin bench
 * workflow does this in CI), and generate one Song end to end before
 * landing. The port pins its own upstream revision; its conversion manifest
 * refuses weights from any other, so a runtime bump can also require a model
 * download bump in models.pins.ts.
 */
export const mlxYueRuntimePin = Object.freeze({
  package: "mlx-yue",
  /** The import name the vendored scripts use: `from lyra import YuE2Pipeline`. */
  importName: "lyra",
  version: "0.1.0",
  repository: "https://github.com/vanch007/mlx-Yue.git",
  commit: "9253ed133343406947bde7b67d43c7a63fb39d99",
})
