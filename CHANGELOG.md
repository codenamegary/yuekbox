# Changelog

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
