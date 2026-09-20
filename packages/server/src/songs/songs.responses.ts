import { SongSchema } from "contracts/http/songs"
import { Song } from "./songs.models"

type SongResponseOptions = Readonly<{
  includeScore?: boolean
}>

export const toSongResponse = (song: Song, options: SongResponseOptions = {}) =>
  SongSchema.parse({
    id: song.id,
    status: song.status,
    ...(song.stage !== null ? { stage: song.stage } : {}),
    ...(song.status === "running" && song.stageCompleted !== null && song.stageTotal !== null
      ? { stageProgress: { completed: song.stageCompleted, total: song.stageTotal } }
      : {}),
    lyrics: song.lyrics,
    style: song.style,
    seed: song.seed,
    ...(song.reference !== null ? { reference: song.reference } : {}),
    ...(song.durationSeconds !== null ? { durationSeconds: song.durationSeconds } : {}),
    ...(song.truncatedAbc !== null && song.truncatedSemantic !== null
      ? { truncated: { abc: song.truncatedAbc, semantic: song.truncatedSemantic } }
      : {}),
    ...(options.includeScore === true && song.scoreAbc !== null ? { scoreAbc: song.scoreAbc } : {}),
    ...(song.errorDetail !== null ? { errorDetail: song.errorDetail } : {}),
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
    ...(song.completedAt !== null ? { completedAt: song.completedAt } : {}),
  })
