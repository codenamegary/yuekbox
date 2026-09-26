import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigRoutesOptions } from "./config.routes"

/** Config routes are mounted but never touched; these paths are never written. */
export const unusedConfigFixture = (): ConfigRoutesOptions => {
  const home = join(tmpdir(), "yuekbox-unused-config-home")
  return { home, configFilePath: join(home, "config.yaml"), flags: {} }
}
