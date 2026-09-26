import * as React from "react"
import { errorMessage } from "@/lib/problems"
import { ActionButton, DownloadBar, StateDot } from "./ModelControls"
import { useSaveModelPathMutation, useStartModelDownloadMutation } from "./models.mutations"
import { downloadRefusalFromError } from "./models.problems"
import { formatBytes, ModelRowView } from "./models.view"

export type ModelRowProps = Readonly<{
  row: ModelRowView
  /** The path the server already refused to download into, when it said so. */
  externalPath?: string | null
}>

/**
 * One model: a dot, the name and its job, the resolved path or the download
 * size, and the two ways to get it. Paths are typed, not picked: a web page
 * cannot read a host folder from a picker.
 */
export const ModelRow: React.FC<ModelRowProps> = ({ row, externalPath = null }) => {
  const savePath = useSaveModelPathMutation()
  const startDownload = useStartModelDownloadMutation()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [refusedPath, setRefusedPath] = React.useState<string | null>(null)
  const [savedPath, setSavedPath] = React.useState<string | null>(null)
  const [rowError, setRowError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<number | null>(null)

  const external = refusedPath ?? externalPath
  // The save is live server-side; this only says so when the folder turned out
  // empty. Readiness carries the saved path once the refetch lands, so the
  // note waits for that instead of flashing while the save is still in flight.
  const savedNote =
    savedPath !== null && row.state === "missing" && row.path === savedPath
      ? "saved · no model found at that folder"
      : null

  const openEditor = (path: string) => {
    setDraft(path)
    setRowError(null)
    setConfirming(null)
    setEditing(true)
  }

  const closeEditor = () => {
    setEditing(false)
    setRowError(null)
  }

  const download = (confirm: boolean) => {
    setRowError(null)
    startDownload.mutate(
      { key: row.key, confirm },
      {
        onSuccess: () => setConfirming(null),
        onError: (error) => {
          const refusal = downloadRefusalFromError(error)
          if (refusal?.kind === "confirmation-required") {
            setConfirming(refusal.expectedBytes)
            return
          }
          if (refusal?.kind === "external-path") {
            setRefusedPath(refusal.path)
            openEditor(refusal.path)
            return
          }
          setRowError(errorMessage(error))
        },
      },
    )
  }

  const save = () => {
    const path = draft.trim()
    if (path === "") {
      setRowError("Enter a folder path.")
      return
    }
    savePath.mutate(
      { key: row.key, path },
      {
        onSuccess: () => {
          setSavedPath(path)
          setEditing(false)
          setRowError(null)
        },
        onError: (error) => setRowError(errorMessage(error)),
      },
    )
  }

  const actions = () => {
    if (row.active || editing) return null
    if (confirming !== null) {
      return (
        <>
          <ActionButton tone="primary" onClick={() => download(true)}>
            download {formatBytes(confirming)}
          </ActionButton>
          <ActionButton tone="ghost" onClick={() => setConfirming(null)}>
            cancel
          </ActionButton>
        </>
      )
    }
    if (row.state === "ready") {
      return (
        <ActionButton tone="ghost" onClick={() => openEditor(row.path)}>
          change
        </ActionButton>
      )
    }
    return (
      <>
        {external === null ? (
          <ActionButton tone="primary" onClick={() => download(true)}>
            download
            {row.sizeBytes > 0 ? ` · ${formatBytes(row.sizeBytes)}` : ""}
          </ActionButton>
        ) : null}
        <ActionButton onClick={() => openEditor(external ?? row.path)}>choose folder</ActionButton>
      </>
    )
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <StateDot state={row.state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-slate-100">{row.name}</span>
          {row.state === "ready" && row.path !== "" ? (
            <span className="truncate font-mono text-3xs text-white/30" title={row.path}>
              {row.path}
            </span>
          ) : null}
          {row.active ? (
            <span className="ml-auto shrink-0 font-mono text-3xs text-cyan-200">
              {row.percent === null ? "starting…" : `${row.percent}%`}
            </span>
          ) : null}
        </div>

        <p className="mt-0.5 font-mono text-3xs text-white/35">
          {row.job} · {formatBytes(row.sizeBytes)}
          {row.state === "missing" ? " download" : " on disk"}
        </p>

        {row.active && row.currentFile !== null ? (
          <p className="mt-0.5 truncate font-mono text-3xs text-white/25" title={row.currentFile}>
            {row.currentFile}
          </p>
        ) : null}
        {row.active ? <DownloadBar value={row.percent ?? 0} className="mt-2" /> : null}

        {row.downloadError !== null ? (
          <p
            className="mt-1 line-clamp-2 font-mono text-3xs leading-relaxed text-amber-200/80"
            title={row.downloadError}
          >
            download stopped · {row.downloadError}
          </p>
        ) : null}
        {external !== null && row.state === "missing" && !row.active ? (
          <p className="mt-1 font-mono text-3xs leading-relaxed text-white/35">
            yuekbox can&apos;t download into {external}. Point at a folder you already have.
          </p>
        ) : null}
        {savedNote !== null ? (
          <p className="mt-1 font-mono text-3xs text-white/35">{savedNote}</p>
        ) : null}
        {rowError !== null ? (
          <p className="mt-1 font-mono text-3xs text-rose-300/90">{rowError}</p>
        ) : null}

        {editing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={draft}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="folder path"
              aria-label={`${row.name} folder path`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save()
                if (event.key === "Escape") {
                  event.stopPropagation()
                  closeEditor()
                }
              }}
              className="ai-input min-w-0 flex-1 basis-48"
            />
            <ActionButton tone="primary" onClick={save} disabled={savePath.isPending}>
              {savePath.isPending ? "saving…" : "save"}
            </ActionButton>
            <ActionButton tone="ghost" onClick={closeEditor}>
              cancel
            </ActionButton>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">{actions()}</div>
    </li>
  )
}
