/**
 * The two host platforms yuekbox ships for. `process.platform` is "darwin" or
 * "linux" on both; anything else never reaches a packaged binary, so the
 * fallback is the platform the app has always assumed.
 */
export type HostPlatform = "linux" | "macos"

export const hostPlatform = (): HostPlatform => (process.platform === "darwin" ? "macos" : "linux")
