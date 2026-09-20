import { AiSlice } from "./ai.assembly"

const notWired = (): never => {
  throw new Error("AI is not wired in this test")
}

/** Every AI port throws; tests that never touch AI use this. */
export const unusedAiFixture = (): AiSlice => ({
  listPresets: () => [],
  getConfig: async () => notWired(),
  saveConfig: async () => notWired(),
  fetchModels: async () => notWired(),
  enhance: async () => notWired(),
  randomSong: async () => notWired(),
})
