import { HostPlatform, hostPlatform } from "../shared/platform"
import { ProcessRunner, runProcess } from "../shared/process"
import { FetchLike, makeDownloadFile } from "./provisioning.download.adapters"
import { makeReadGpuFacts } from "./provisioning.gpu.adapters"
import { makeProvisionAll } from "./provisioning.provision-all.usecase"
import { makeEnsurePython, makeEnsureVenv } from "./provisioning.python.adapters"
import { makeInstallScripts, toolsRoot } from "./provisioning.scripts.adapters"
import { makeEnsureUv } from "./provisioning.uv.adapters"
import { InstallScripts, ProvisionAll } from "./provisioning.ports"

export type ProvisioningSlice = Readonly<{
  provisionAll: ProvisionAll
}>

export type AssembleProvisioningDeps = Readonly<{
  home: string
  /** Defaults to the machine the process runs on; tests pass one explicitly. */
  platform?: HostPlatform
  /** Test seams; the process root leaves every one at its real default. */
  fetchImpl?: FetchLike
  runProcess?: ProcessRunner
  installScripts?: InstallScripts
}>

/**
 * Wires the provisioning slice for the process root: the pinned uv fetch,
 * the managed interpreter, the machine probe, the environment(s) the
 * platform's pins describe, and the #50 script installer.
 */
export const assembleProvisioningSlice = (deps: AssembleProvisioningDeps): ProvisioningSlice => {
  const platform = deps.platform ?? hostPlatform()
  const processRunner = deps.runProcess ?? runProcess
  const downloadFile =
    deps.fetchImpl === undefined
      ? makeDownloadFile((url) => fetch(url))
      : makeDownloadFile(deps.fetchImpl)

  const provisionAll = makeProvisionAll({
    ensureUv: makeEnsureUv({
      home: deps.home,
      downloadFile,
      runProcess: processRunner,
      platform,
    }),
    ensurePython: makeEnsurePython({ home: deps.home, runProcess: processRunner }),
    readGpuFacts: makeReadGpuFacts({ cwd: deps.home, runProcess: processRunner, platform }),
    ensureVenv: makeEnsureVenv({ home: deps.home, runProcess: processRunner }),
    installScripts: deps.installScripts ?? makeInstallScripts(toolsRoot),
  })

  return Object.freeze({ provisionAll })
}
