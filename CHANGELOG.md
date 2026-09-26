# Changelog

## [0.3.0](https://github.com/codenamegary/yuekbox/compare/v0.2.0...v0.3.0) (2026-09-26)


### Features

* **build:** compile web + server into a single yuekbox executable ([#63](https://github.com/codenamegary/yuekbox/issues/63)) ([75f78e1](https://github.com/codenamegary/yuekbox/commit/75f78e1dc2546c949085441bb765b0c7bb261d0a))
* **ci:** release binaries and a one-line installer ([#67](https://github.com/codenamegary/yuekbox/issues/67)) ([9153e97](https://github.com/codenamegary/yuekbox/commit/9153e97667445013aebdced517ee2dc5014689ec))
* **contracts,server:** model readiness and system preflight ([#64](https://github.com/codenamegary/yuekbox/issues/64)) ([3f63220](https://github.com/codenamegary/yuekbox/commit/3f63220211e2f08359ca1e07321171f68fe5d7f7))
* **server,contracts:** download models on request and prompt when one is needed ([#65](https://github.com/codenamegary/yuekbox/issues/65)) ([9039f57](https://github.com/codenamegary/yuekbox/commit/9039f57aceecea9f1bc7ab558421a06fd6601978))
* **server:** provision Python, venvs, and the pinned runtime under ~/.yuekbox ([#61](https://github.com/codenamegary/yuekbox/issues/61)) ([5264529](https://github.com/codenamegary/yuekbox/commit/5264529d7b04e034d54bfaab2f77c73df79b522c))
* **server:** resolve model paths from config.yaml and CLI flags ([#59](https://github.com/codenamegary/yuekbox/issues/59)) ([592dcca](https://github.com/codenamegary/yuekbox/commit/592dccaa63a711cd3a6cd07ddf01b9e9ebe68760))
* **web,server:** model manager settings and live model path changes ([#66](https://github.com/codenamegary/yuekbox/issues/66)) ([7d2b4c3](https://github.com/codenamegary/yuekbox/commit/7d2b4c39fa596574e100bb44bb04155e2c2fcc4d))


### Bug Fixes

* **server,web:** address the review findings across the stack ([#73](https://github.com/codenamegary/yuekbox/issues/73)) ([7c7a0b6](https://github.com/codenamegary/yuekbox/commit/7c7a0b6e2292cd1810e6c801e9e7a169808b545d))
* **server:** use the configured whisper model and report the real version ([#69](https://github.com/codenamegary/yuekbox/issues/69)) ([4987036](https://github.com/codenamegary/yuekbox/commit/498703697140744338626f7fd16ffaeba31ae614))

## [0.2.0](https://github.com/codenamegary/yuekbox/compare/v0.1.0...v0.2.0) (2026-09-24)


### Features

* **web:** generating overlay with slot-machine stage reel ([#45](https://github.com/codenamegary/yuekbox/issues/45)) ([9d79816](https://github.com/codenamegary/yuekbox/commit/9d798162f52584081dd9d5ac6e28496fd8ff4ce8))

## [0.1.0](https://github.com/codenamegary/yuekbox/compare/v0.1.0...v0.1.0) (2026-09-22)


### Features

* **ai,web:** AI songwriters, full auto, and score-timed lyric overlay ([#6](https://github.com/codenamegary/yuekbox/issues/6)) ([93360ca](https://github.com/codenamegary/yuekbox/commit/93360ca3f1ee9ffff98fc1524baa7586e996dab5))
* **ai,web:** AI-authored song visualizations ([#21](https://github.com/codenamegary/yuekbox/issues/21)) ([420ff32](https://github.com/codenamegary/yuekbox/commit/420ff325c22d03fd667d2f0b6a82b137bea0952b))
* **ai:** align the style prompts with YuE2 style guidance ([#38](https://github.com/codenamegary/yuekbox/issues/38)) ([37e2e31](https://github.com/codenamegary/yuekbox/commit/37e2e31a3406c997d46388b777a53bb372d233e6)), closes [#33](https://github.com/codenamegary/yuekbox/issues/33)
* **ai:** rework the visualizer authoring prompt ([#42](https://github.com/codenamegary/yuekbox/issues/42)) ([0ab0d4e](https://github.com/codenamegary/yuekbox/commit/0ab0d4e741de528b284be8c87d56d546012464ec))
* **server,web:** align lyric lines by sung note counts ([#29](https://github.com/codenamegary/yuekbox/issues/29)) ([d4ee5c3](https://github.com/codenamegary/yuekbox/commit/d4ee5c3b651238f0724b292f9bd8a3da7d64ae88))
* **server,web:** auto-calibrate lyric cue timing from the generated audio ([#25](https://github.com/codenamegary/yuekbox/issues/25)) ([009e772](https://github.com/codenamegary/yuekbox/commit/009e77263da5b45a03e8a05df78ceaf600b835ac))
* **server,web:** give visuals the measured score ([#41](https://github.com/codenamegary/yuekbox/issues/41)) ([a8e58de](https://github.com/codenamegary/yuekbox/commit/a8e58deccdd1a03f3ffcfea12dcf554279d4948f))
* **server,web:** store and show song titles ([#31](https://github.com/codenamegary/yuekbox/issues/31)) ([2ad737b](https://github.com/codenamegary/yuekbox/commit/2ad737b9384b64ae0d2026ff57e717915067c4da))
* **server,web:** transcribe lyric cues with Whisper ([#32](https://github.com/codenamegary/yuekbox/issues/32)) ([a5380e1](https://github.com/codenamegary/yuekbox/commit/a5380e1fbff3ee0c1026e4618172647806973abb))
* **server:** dedicated prompts, two-call random song, retry unusable results ([#11](https://github.com/codenamegary/yuekbox/issues/11)) ([427a86e](https://github.com/codenamegary/yuekbox/commit/427a86ee6e90e01a00e55383c63d3f40b990098d))
* **songs:** reference audio covers via SheetSage2 transcription ([#4](https://github.com/codenamegary/yuekbox/issues/4)) ([dbc5c82](https://github.com/codenamegary/yuekbox/commit/dbc5c826ce2df1c350b54c49e6647c94671b1480))
* **web:** add song downloads and clamp editor height ([#3](https://github.com/codenamegary/yuekbox/issues/3)) ([f49006a](https://github.com/codenamegary/yuekbox/commit/f49006a95c3bdc790251fb7b94da30313563c2a1))
* **web:** top-left player and a writer that hides during playback ([#40](https://github.com/codenamegary/yuekbox/issues/40)) ([fc14a7c](https://github.com/codenamegary/yuekbox/commit/fc14a7c5585351f3154cb06ee7b5570655ea565b)), closes [#39](https://github.com/codenamegary/yuekbox/issues/39)


### Bug Fixes

* **ai:** keep the style brief out of the lyric prompts ([#28](https://github.com/codenamegary/yuekbox/issues/28)) ([ab6a978](https://github.com/codenamegary/yuekbox/commit/ab6a978ef66d27858e55692c68aeabfdbda1e9ee))
* **server:** default the SheetSage2 base model to the kit's MERT snapshot ([#26](https://github.com/codenamegary/yuekbox/issues/26)) ([51a83c5](https://github.com/codenamegary/yuekbox/commit/51a83c59242a32c7831b55d70c56b5f5950c8429))
* **web:** keep full auto rolling after an interrupted song ([#24](https://github.com/codenamegary/yuekbox/issues/24)) ([33485a9](https://github.com/codenamegary/yuekbox/commit/33485a9ecdde34441e0304956e042efa8e852e56)), closes [#23](https://github.com/codenamegary/yuekbox/issues/23)
* **web:** keep the anchored first phrase to one line ([#27](https://github.com/codenamegary/yuekbox/issues/27)) ([d76c5d2](https://github.com/codenamegary/yuekbox/commit/d76c5d2dea9e705365d6f90bb2f459f8770bd0f8))
