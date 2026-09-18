import * as React from "react"
import { Reference } from "contracts/http/references"
import { Song, SongStage } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/Button"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { useCreateSongMutation, useUploadReferenceMutation } from "./songs.mutations"
import { stageLabels, stageOrderFor } from "./songs.stages"

type SongFormProps = Readonly<{
  activeSong: Song | null
  queueDepth: number | null
  style: string
  lyrics: string
  onStyleChange: (value: string) => void
  onLyricsChange: (value: string) => void
  onCreated: (song: Song) => void
}>

const pipClassName = (song: Song | null, stages: readonly SongStage[], index: number): string => {
  if (song === null) return "w-2 h-2 rounded-full bg-white/20"
  if (song.status === "failed") return "w-2 h-2 rounded-full bg-destructive/70"
  if (song.status === "complete") {
    return "w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#00f0ff]"
  }
  if (song.status === "running" && song.stage !== undefined) {
    const stageIndex = stages.indexOf(song.stage)
    if (index === stageIndex) {
      return "w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_14px_#00f0ff] scale-125"
    }
    if (index < stageIndex) {
      return "w-2 h-2 rounded-full bg-cyan-500"
    }
  }
  return "w-2 h-2 rounded-full bg-white/20"
}

export const SongForm: React.FC<SongFormProps> = ({
  activeSong,
  queueDepth,
  style,
  lyrics,
  onStyleChange,
  onLyricsChange,
  onCreated,
}) => {
  const createSong = useCreateSongMutation()
  const uploadReference = useUploadReferenceMutation()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [reference, setReference] = React.useState<Reference | null>(null)
  const [uploadFailed, setUploadFailed] = React.useState(false)

  const canGenerate =
    style.trim().length > 0 &&
    lyrics.trim().length > 0 &&
    !createSong.isPending &&
    !uploadReference.isPending

  const stages = stageOrderFor(reference !== null || activeSong?.reference !== undefined)

  const pickFile = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (fileInputRef.current !== null) fileInputRef.current.value = ""
    if (file === undefined) return

    setUploadFailed(false)
    uploadReference.mutate(file, {
      onSuccess: (uploaded) => {
        setReference(uploaded)
        setUploadFailed(false)
      },
      onError: () => {
        setReference(null)
        setUploadFailed(true)
      },
    })
  }

  const clearReference = () => {
    setReference(null)
    setUploadFailed(false)
    uploadReference.reset()
  }

  const submit = () => {
    if (!canGenerate) return
    createSong.mutate(
      {
        style: style.trim(),
        lyrics: lyrics.trim(),
        ...(reference !== null ? { referenceId: reference.id } : {}),
      },
      {
        onSuccess: (song) => {
          setReference(null)
          uploadReference.reset()
          onCreated(song)
        },
      },
    )
  }

  const progress =
    activeSong !== null && activeSong.status === "running" ? activeSong.stageProgress : undefined
  const progressPercent =
    progress === undefined
      ? null
      : Math.max(0, Math.min(100, (progress.completed / progress.total) * 100))

  return (
    <div className="w-full max-w-lg pointer-events-auto space-y-6">
      <div className="space-y-2">
        <Label
          htmlFor="style-input"
          className="block font-mono text-2xs tracking-[0.35em] uppercase text-cyan-300/80 pl-1"
        >
          style
        </Label>
        <div className="hairline-glass-box rounded-2xl p-4">
          <Textarea
            id="style-input"
            rows={4}
            value={style}
            onChange={(event) => onStyleChange(event.target.value)}
            placeholder="genre, voice, instruments, tempo"
            className="w-full min-h-[4lh] max-h-[8lh] overflow-y-auto border-0 bg-transparent p-0 text-sm text-slate-100 shadow-none focus-visible:ring-0 resize-none leading-relaxed placeholder:text-white/15 md:text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="lyrics-input"
          className="block font-mono text-2xs tracking-[0.35em] uppercase text-cyan-300/80 pl-1"
        >
          lyrics
        </Label>
        <div className="hairline-glass-box rounded-2xl p-4">
          <Textarea
            id="lyrics-input"
            rows={4}
            value={lyrics}
            onChange={(event) => onLyricsChange(event.target.value)}
            placeholder="[Verse]\nwrite the words here\n\n[Chorus]\n..."
            className="w-full min-h-[4lh] max-h-[8lh] overflow-y-auto border-0 bg-transparent p-0 text-xs font-mono text-slate-200 shadow-none focus-visible:ring-0 resize-none leading-relaxed placeholder:text-white/15"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 min-h-[1.75rem]">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={onFileChange}
          className="hidden"
          aria-label="Upload a reference song"
        />
        {reference === null ? (
          <button
            type="button"
            onClick={pickFile}
            disabled={uploadReference.isPending}
            title="Upload a reference song; its melody guides the cover"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1",
              "font-mono text-3xs tracking-[0.3em] uppercase text-cyan-300/70 transition-colors",
              "hover:border-cyan-400/60 hover:text-cyan-200 disabled:opacity-40",
              uploadFailed && "border-rose-400/40 text-rose-300/80",
            )}
          >
            <span>{uploadReference.isPending ? "◌" : "＋"}</span>
            {uploadReference.isPending ? "uploading…" : "reference song"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 font-mono text-3xs tracking-[0.2em] uppercase text-cyan-200">
            <span title="Melody reference attached">⌁</span>
            <span className="max-w-[16rem] truncate">{reference.filename}</span>
            <button
              type="button"
              onClick={clearReference}
              title="Remove reference"
              className="text-cyan-200/60 hover:text-white transition-colors"
            >
              ✕
            </button>
          </span>
        )}
        {uploadFailed ? (
          <span className="font-mono text-3xs tracking-widest text-rose-300/90 uppercase">
            reference upload failed
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-4 pt-1">
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canGenerate}
          title="Generate Song (Click to run 5-stage synthesis)"
          className="group relative w-12 h-12 rounded-full border border-white/20 bg-white/[0.04] hover:bg-cyan-500/20 hover:border-cyan-400/80 transition-all duration-500 shadow-[0_0_25px_rgba(0,240,255,0.2)] active:scale-95 disabled:opacity-30"
        >
          <span className="font-mono text-base text-white/80 group-hover:text-white group-hover:scale-125 transition-transform duration-300">
            ✦
          </span>
        </Button>

        <div
          className={cn(
            "relative transition-opacity duration-500",
            activeSong?.status === "running" ? "opacity-100" : "opacity-40",
          )}
        >
          <div id="stages-pips" className="flex items-center gap-2.5">
            {stages.map((stage, index) => (
              <span
                key={stage}
                className={pipClassName(activeSong, stages, index)}
                title={stageLabels[stage]}
              />
            ))}
          </div>
          {progressPercent !== null ? (
            <div className="absolute left-0 right-0 top-full mt-1.5 h-px overflow-hidden bg-white/10">
              <div
                className="h-full bg-cyan-400/80 transition-[width] duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}
        </div>

        {queueDepth !== null && queueDepth > 0 ? (
          <span className="font-mono text-3xs tracking-widest text-cyan-200/70 uppercase">
            queue {queueDepth}
          </span>
        ) : null}
      </div>

      {createSong.error !== null ? (
        <p className="text-xs text-rose-300/90">{createSong.error.message}</p>
      ) : null}
    </div>
  )
}
