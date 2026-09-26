import { join } from "node:path"

/**
 * yuekbox's own home. Everything the app manages (tools, models, venvs, our
 * scripts, app data) lives under these folders. The user only configures the
 * five model directories under `models/`.
 */
export type HomeLayout = Readonly<{
  home: string
  tools: string
  models: string
  venvs: string
  scripts: string
  data: string
}>

export const homeLayout = (home: string): HomeLayout =>
  Object.freeze({
    home,
    tools: join(home, "tools"),
    models: join(home, "models"),
    venvs: join(home, "venvs"),
    scripts: join(home, "scripts"),
    data: join(home, "data"),
  })

/** The one shared environment every Python pass runs in. */
export const venvPath = (home: string): string => join(homeLayout(home).venvs, "python")

/** The shared environment's interpreter, the one every adapter runs. */
export const pythonPath = (home: string): string => join(venvPath(home), "bin", "python")

export const defaultHome = (osHome: string): string => join(osHome, ".yuekbox")

/** Upstream directory names for the five models under `<home>/models`. */
export const modelDirectoryNames = Object.freeze({
  yue2: "YuE2-3B",
  yue2Vae: "YuE2-Vae",
  sheetsage2: "SheetSage2",
  sheetsage2Base: "MERT-v2-FullSong",
  whisper: "whisper-large-v3-turbo",
})

/** Our generate entrypoint, installed by the script installer. */
export const generateScriptPath = (home: string): string =>
  join(homeLayout(home).scripts, "generate.py")

export const sheetsage2ScriptPath = (home: string): string =>
  join(homeLayout(home).scripts, "transcribe.py")

export const lyricAlignScriptPath = (home: string): string =>
  join(homeLayout(home).scripts, "align.py")

export const sqlitePath = (home: string): string => join(homeLayout(home).data, "yuekbox.sqlite")

export const mediaDir = (home: string): string => join(homeLayout(home).data, "media")
