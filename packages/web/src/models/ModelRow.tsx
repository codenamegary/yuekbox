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
 *
 * Refusals and errors derive from the mutations' own state, so a finished
 * save replaces them instead of stacking stale state behind a hidden button.
 * A refusal only sticks while the row still points at the refused folder.
 */
export const ModelRow: React.FC<ModelRowProps> = ({ row, externalPath = null }) => {
  const savePath = useSaveModelPathMutation()
  const startDownload = useStartModelDownloadMutation()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")

  const refusal =
    startDownload.error === null ? null : downloadRefusalFromError(startDownload.error)
  const refused = refusal?.kind === "external-path" ? refusal.path : (externalPath ?? null)
  const external = refused !== null && refused === row.path ? refused : null
  const rowError =
    refusal === null && startDownload.error !== null ? errorMessage(startDownload.error) : null
  const saveError = savePath.error !== null ? errorMessage(savePath.error) : null

  // The save is live server-side; this only says so when the folder turned out
  // empty. Readiness carries the saved path once the refetch lands, so the
  // note waits for that instead of flashing while the save is still in flight.
  const savedNote =
    savePath.data !== undefined &&
    row.state === "missing" &&
    row.path === savePath.data.models[row.key]
      ? "Saved, but there's no model in that folder."
      : null

  const openEditor = (path: string) => {
    setDraft(path)
    setEditing(true)
  }

  // The button itself is the confirmation: it names the size, so the click
  // starts the download. The server threshold still guards direct API calls.
  const download = () => {
    startDownload.mutate({ key: row.key, confirm: true })
  }

  const save = () => {
    savePath.mutate(
      { key: row.key, path: draft.trim() },
      {
        onSuccess: () => {
          // The refusal pointed at the old folder; the new folder deserves a
          // fresh download button.
          startDownload.reset()
          setEditing(false)
        },
      },
    )
  }

  const actions = () => {
    if (row.active || editing) return null
    if (row.state === "ready") {
      return (
        <ActionButton tone="ghost" onClick={() => openEditor(row.path)}>
          Change
        </ActionButton>
      )
    }
    return (
      <>
        {external === null ? (
          <ActionButton tone="primary" onClick={download}>
            Download
            {row.sizeBytes > 0 ? ` · ${formatBytes(row.sizeBytes)}` : ""}
          </ActionButton>
        ) : null}
        <ActionButton onClick={() => openEditor(external ?? row.path)}>Choose folder</ActionButton>
      </>
    )
  }

  return (
    <li className="flex items-start gap-4 py-4">
      <StateDot state={row.state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-base font-semibold text-snow">{row.name}</span>
          {row.active ? (
            <span className="ml-auto shrink-0 font-mono text-base text-orange tabular-nums">
              {row.percent === null ? "Starting…" : `${row.percent}%`}
            </span>
          ) : null}
        </div>

        <p className="text-base text-dim">
          {row.job} · {formatBytes(row.sizeBytes)}
          {row.state === "missing" ? " download" : " on disk"}
        </p>

        {row.state === "ready" && row.path !== "" ? (
          <p className="mt-0.5 truncate font-mono text-sm text-faint" title={row.path}>
            {row.path}
          </p>
        ) : null}
        {row.active && row.currentFile !== null ? (
          <p className="mt-0.5 truncate font-mono text-sm text-faint" title={row.currentFile}>
            {row.currentFile}
          </p>
        ) : null}
        {row.active ? <DownloadBar value={row.percent ?? 0} className="mt-2" /> : null}

        {row.downloadError !== null ? (
          <p className="mt-1 line-clamp-2 text-base text-orange" title={row.downloadError}>
            The download stopped. {row.downloadError}
          </p>
        ) : null}
        {external !== null && row.state === "missing" && !row.active ? (
          <p className="mt-1 text-base text-dim">
            Yuekbox can&apos;t download into {external}. Point at a folder you already have.
          </p>
        ) : null}
        {savedNote !== null ? <p className="mt-1 text-base text-dim">{savedNote}</p> : null}
        {rowError !== null ? <p className="mt-1 text-base text-alarm">{rowError}</p> : null}
        {saveError !== null ? <p className="mt-1 text-base text-alarm">{saveError}</p> : null}

        {editing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={draft}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="Folder path"
              aria-label={`${row.name} folder path`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && draft.trim() !== "") save()
                if (event.key === "Escape") {
                  event.stopPropagation()
                  setEditing(false)
                }
              }}
              className="field min-w-0 flex-1 basis-48 px-3 py-1.5 font-mono text-base"
            />
            <ActionButton
              tone="primary"
              onClick={save}
              disabled={savePath.isPending || draft.trim() === ""}
            >
              {savePath.isPending ? "Saving…" : "Save"}
            </ActionButton>
            <ActionButton tone="ghost" onClick={() => setEditing(false)}>
              Cancel
            </ActionButton>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">{actions()}</div>
    </li>
  )
}
