/**
 * Prompt Adherence is the UI's name for the runtime's cfg scale. The slider
 * covers the useful band around the 1.0 default; the API still accepts the
 * runtime's full 0..20.
 */
export const cfgScaleMin = 0
export const cfgScaleMax = 2
export const cfgScaleStep = 0.1
/** Below the low mark the model takes liberties; above the high mark it over-commits. */
export const cfgScaleSweetLow = 0.7
export const cfgScaleSweetHigh = 1.4

/** The slider position of a value, 0..100, for the track's marks. */
export const cfgScalePercent = (value: number): number =>
  ((value - cfgScaleMin) / (cfgScaleMax - cfgScaleMin)) * 100

export const formatCfgScale = (value: number): string => value.toFixed(1)
