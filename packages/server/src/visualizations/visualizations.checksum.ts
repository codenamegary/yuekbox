import { createHash } from "node:crypto"

/** SHA-256 of the file's bytes. The web swaps visuals when this changes. */
export const visualizationChecksum = (code: string): string =>
  createHash("sha256").update(code).digest("hex")
