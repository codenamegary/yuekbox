import { expect, test } from "bun:test"
import { join } from "node:path"
import { ModelPathOverrides } from "contracts/http/config"
import { resolveBootEnv } from "./config.boot"

const withInput = (input: {
  argv?: readonly string[]
  env?: Readonly<Record<string, string | undefined>>
  osHome?: string
  file?: ModelPathOverrides
}) => ({
  argv: input.argv ?? ["bun", "src/server.ts"],
  env: input.env ?? {},
  osHome: input.osHome ?? "/home/u",
  loadModelOverrides: async () => input.file ?? {},
})

test("defaults every managed path under ~/.yuekbox", async () => {
  const boot = await resolveBootEnv(withInput({}))
  const home = "/home/u/.yuekbox"

  expect(boot.home).toBe(home)
  expect(boot.configFilePath).toBe(join(home, "config.yaml"))
  expect(boot.modelPaths).toEqual({
    yue2: join(home, "models", "YuE2-3B"),
    yue2Vae: join(home, "models", "YuE2-Vae"),
    sheetsage2: join(home, "models", "SheetSage2"),
    sheetsage2Base: join(home, "models", "MERT-v2-FullSong"),
    whisper: join(home, "models", "whisper-large-v3-turbo"),
  })
  expect(boot.sqlitePath).toBe(join(home, "data", "yuekbox.sqlite"))
  expect(boot.mediaDir).toBe(join(home, "data", "media"))
  expect(boot.yue2Python).toBe(join(home, "venvs/yue2/bin/python"))
  expect(boot.generateScript).toBe(join(home, "scripts/generate.py"))
  expect(boot.sheetsage2Python).toBe(join(home, "venvs/sheetsage2/bin/python"))
  expect(boot.sheetsage2Script).toBe(join(home, "scripts/transcribe.py"))
  expect(boot.lyricAlignPython).toBe(join(home, "venvs/lyricalign/bin/python"))
  expect(boot.lyricAlignScript).toBe(join(home, "scripts/align.py"))
})

test("runtime knobs keep their existing defaults", async () => {
  const boot = await resolveBootEnv(withInput({}))

  expect(boot.host).toBe("127.0.0.1")
  expect(boot.port).toBe(8787)
  expect(boot.gpuBudget).toBe(16)
  expect(boot.ffmpegBin).toBe("ffmpeg")
  expect(boot.sheetsage2Device).toBe("cuda")
  expect(boot.sheetsage2Offline).toBe(true)
  expect(boot.lyricAlignDevice).toBe("cuda:0")
  expect(boot.referenceMaxBytes).toBe(26214400)
})

test("explicit env overrides win over the home defaults", async () => {
  const boot = await resolveBootEnv(
    withInput({
      env: {
        HOST: "0.0.0.0",
        PORT: "9000",
        SQLITE_PATH: "/srv/db/yuekbox.sqlite",
        MEDIA_DIR: "/srv/media",
        YUE2_PYTHON: "/opt/yue2/bin/python",
        SHEETSAGE2_PYTHON: "/opt/sheetsage2/bin/python",
        SHEETSAGE2_SCRIPT: "/opt/sheetsage2/transcribe.py",
        LYRIC_ALIGN_PYTHON: "/opt/lyricalign/bin/python",
        LYRIC_ALIGN_SCRIPT: "/opt/lyricalign/align.py",
        YUE2_GPU_BUDGET: "8",
        FFMPEG_BIN: "/usr/bin/ffmpeg",
        SHEETSAGE2_DEVICE: "cpu",
        SHEETSAGE2_OFFLINE: "0",
        LYRIC_ALIGN_DEVICE: "cpu:0",
        REFERENCE_MAX_BYTES: "1024",
      },
    }),
  )

  expect(boot.host).toBe("0.0.0.0")
  expect(boot.port).toBe(9000)
  expect(boot.sqlitePath).toBe("/srv/db/yuekbox.sqlite")
  expect(boot.mediaDir).toBe("/srv/media")
  expect(boot.yue2Python).toBe("/opt/yue2/bin/python")
  expect(boot.sheetsage2Python).toBe("/opt/sheetsage2/bin/python")
  expect(boot.sheetsage2Script).toBe("/opt/sheetsage2/transcribe.py")
  expect(boot.lyricAlignPython).toBe("/opt/lyricalign/bin/python")
  expect(boot.lyricAlignScript).toBe("/opt/lyricalign/align.py")
  expect(boot.gpuBudget).toBe(8)
  expect(boot.ffmpegBin).toBe("/usr/bin/ffmpeg")
  expect(boot.sheetsage2Device).toBe("cpu")
  expect(boot.sheetsage2Offline).toBe(false)
  expect(boot.lyricAlignDevice).toBe("cpu:0")
  expect(boot.referenceMaxBytes).toBe(1024)
})

test("--home moves the whole layout and the config file", async () => {
  const boot = await resolveBootEnv(
    withInput({ argv: ["bun", "src/server.ts", "--home", "/srv/yuekbox"] }),
  )

  expect(boot.home).toBe("/srv/yuekbox")
  expect(boot.configFilePath).toBe("/srv/yuekbox/config.yaml")
  expect(boot.modelPaths.yue2).toBe("/srv/yuekbox/models/YuE2-3B")
  expect(boot.sqlitePath).toBe("/srv/yuekbox/data/yuekbox.sqlite")
  expect(boot.yue2Python).toBe("/srv/yuekbox/venvs/yue2/bin/python")
})

test("--config points at another config file and leaves the layout alone", async () => {
  const boot = await resolveBootEnv(
    withInput({ argv: ["bun", "src/server.ts", "--config", "/etc/yuekbox.yaml"] }),
  )

  expect(boot.configFilePath).toBe("/etc/yuekbox.yaml")
  expect(boot.home).toBe("/home/u/.yuekbox")
})

test("loads the config file from the resolved path", async () => {
  let seenPath = ""

  const boot = await resolveBootEnv({
    argv: ["bun", "src/server.ts", "--home", "/srv/yuekbox"],
    env: {},
    osHome: "/home/u",
    loadModelOverrides: async (configFilePath) => {
      seenPath = configFilePath
      return { sheetsage2: "/mnt/SheetSage2" }
    },
  })

  expect(seenPath).toBe("/srv/yuekbox/config.yaml")
  expect(boot.modelPaths.sheetsage2).toBe("/mnt/SheetSage2")
  expect(boot.modelPaths.whisper).toBe("/srv/yuekbox/models/whisper-large-v3-turbo")
})

test("model flags beat the config file and the home default", async () => {
  const boot = await resolveBootEnv(
    withInput({
      argv: ["bun", "src/server.ts", "--whisper", "/flag/whisper"],
      file: { yue2: "/file/YuE2-3B", whisper: "/file/whisper" },
    }),
  )

  expect(boot.modelPaths.yue2).toBe("/file/YuE2-3B")
  expect(boot.modelPaths.whisper).toBe("/flag/whisper")
  expect(boot.flags).toEqual({ whisper: "/flag/whisper" })
})
