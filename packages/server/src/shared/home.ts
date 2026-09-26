import { join } from "node:path"

/**
 * yuekbox's own home. Everything the app manages (models, venvs, our scripts,
 * app data) lives under these folders. The user only configures the five model
 * directories under `models/`.
 */
export type HomeLayout = Readonly<{
  home: string
  models: string
  venvs: string
  scripts: string
  data: string
}>

export const homeLayout = (home: string): HomeLayout =>
  Object.freeze({
    home,
    models: join(home, "models"),
    venvs: join(home, "venvs"),
    scripts: join(home, "scripts"),
    data: join(home, "data"),
  })

export const defaultHome = (osHome: string): string => join(osHome, ".yuekbox")

/** Upstream directory names for the five models under `<home>/models`. */
export const modelDirectoryNames = Object.freeze({
  yue2: "YuE2-3B",
  yue2Vae: "YuE2-Vae",
  sheetsage2: "SheetSage2",
  sheetsage2Base: "MERT-v2-FullSong",
  whisper: "whisper-large-v3-turbo",
})

export const yue2PythonPath = (home: string): string =>
  join(homeLayout(home).venvs, "yue2", "bin", "python")

export const yue2ScriptPath = (home: string): string =>
  join(homeLayout(home).venvs, "yue2", "bin", "yue2")

export const sheetsage2PythonPath = (home: string): string =>
  join(homeLayout(home).venvs, "sheetsage2", "bin", "python")

export const sheetsage2ScriptPath = (home: string): string =>
  join(homeLayout(home).scripts, "transcribe.py")

export const lyricAlignPythonPath = (home: string): string =>
  join(homeLayout(home).venvs, "lyricalign", "bin", "python")

export const lyricAlignScriptPath = (home: string): string =>
  join(homeLayout(home).scripts, "align.py")

export const sqlitePath = (home: string): string => join(homeLayout(home).data, "yuekbox.sqlite")

export const mediaDir = (home: string): string => join(homeLayout(home).data, "media")
