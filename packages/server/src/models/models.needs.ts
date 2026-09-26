import { ModelDownloadKey } from "./models.models"

/**
 * Which models a generation needs before it can start.
 *
 * - A freeform Song: `yue2` and `yue2Vae` block it.
 * - A reference cover: `sheetsage2` and `sheetsage2Base` block it too, because
 *   the reference is transcribed before generation. MERT-v2-FullSong is only
 *   ever prompted for a cover; a freeform Song never asks for it.
 * - `whisper` never blocks: a missing whisper only drops the lyric cues, and
 *   the Song still completes without a calibration.
 */
export const modelsRequiredForGeneration = (
  input: Readonly<{ hasReference: boolean }>,
): readonly ModelDownloadKey[] =>
  input.hasReference ? ["yue2", "yue2Vae", "sheetsage2", "sheetsage2Base"] : ["yue2", "yue2Vae"]
