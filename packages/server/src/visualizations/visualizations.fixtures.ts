import { VisualizationsSlice } from "./visualizations.assembly"

const notWired = (): never => {
  throw new Error("Visualizations are not wired in this test")
}

/** Every visualization port throws; tests that never touch visuals use this. */
export const unusedVisualizationsFixture = (): VisualizationsSlice => ({
  getVisualization: async () => notWired(),
  requestVisualization: async () => notWired(),
  drain: async () => notWired(),
})
