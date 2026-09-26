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
  /** Test seams; the process root leaves every one at its real default. */
  findExecutable?: (name: string) => string | null
  fetchImpl?: FetchLike
  runProcess?: ProcessRunner
  installScripts?: InstallScripts
}>

/**
 * Wires the provisioning slice for the process root: the pinned uv fetch,
 * the managed interpreters, the three environments, the driver probe, and
 * the #50 script installer.
 */
export const assembleProvisioningSlice = (deps: AssembleProvisioningDeps): ProvisioningSlice => {
  const processRunner = deps.runProcess ?? runProcess
  const downloadFile =
    deps.fetchImpl === undefined
      ? makeDownloadFile((url) => fetch(url))
      : makeDownloadFile(deps.fetchImpl)
  const findExecutable = deps.findExecutable ?? ((name: string) => Bun.which(name))

  const provisionAll = makeProvisionAll({
    ensureUv: makeEnsureUv({
      home: deps.home,
      findExecutable,
      downloadFile,
      runProcess: processRunner,
    }),
    ensurePython: makeEnsurePython({ home: deps.home, runProcess: processRunner }),
    readGpuFacts: makeReadGpuFacts({ cwd: deps.home, runProcess: processRunner }),
    ensureVenv: makeEnsureVenv({ home: deps.home, runProcess: processRunner }),
    installScripts: deps.installScripts ?? makeInstallScripts(toolsRoot),
  })

  return Object.freeze({ provisionAll })
}
