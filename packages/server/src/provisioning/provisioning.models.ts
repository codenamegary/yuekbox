/** The tools the installer wrote into the home, flattened, in manifest order. */
export type InstalledScripts = Readonly<{
  scriptsDir: string
  files: readonly string[]
}>

export type InstallScriptsError = Readonly<{
  kind: "install_scripts_failed"
  detail: string
}>
