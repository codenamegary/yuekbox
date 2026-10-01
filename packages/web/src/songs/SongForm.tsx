import * as React from "react"
import { Dices, Disc3, Paperclip, Sparkles, X } from "lucide-react"
import { EnhanceScope } from "contracts/http/ai"
import { MissingModel } from "contracts/http/models"
import { Reference } from "contracts/http/references"
import { Song, SongStage } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/Button"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Wordmark } from "@/components/ui/Wordmark"
import { blockedModelsFromError } from "@/models/models.problems"
import { useCreateSongMutation, useUploadReferenceMutation } from "./songs.mutations"
import {
  cfgScaleMax,
  cfgScaleMin,
  cfgScalePercent,
  cfgScaleStep,
  cfgScaleSweetHigh,
  cfgScaleSweetLow,
  formatCfgScale,
} from "./songs.cfg"
import { stageLabels, stageOrderFor, stageProgressPercent } from "./songs.stages"

type SongFormProps = Readonly<{
  activeSong: Song | null
  queueDepth: number | null
  style: string
  lyrics: string
  cfgScale: number
  aiEnabled: boolean
  enhancing: readonly EnhanceScope[]
  enhanceError: string | null
  randomPending: boolean
  onStyleChange: (value: string) => void
  onLyricsChange: (value: string) => void
  onCfgScaleChange: (value: number) => void
  onCreated: (song: Song) => void
  onBlocked: (models: readonly MissingModel[]) => void
  onEnhance: (kind: EnhanceScope) => void
  onRandom: () => void
  onToggleFullAuto: () => void
}>

type StageMeterProps = Readonly<{
  song: Song | null
  stages: readonly SongStage[]
  queueDepth: number | null
}>

/** One segment per stage: done, the one in progress, and the ones still ahead. */
const StageMeter: React.FC<StageMeterProps> = ({ song, stages, queueDepth }) => {
  if (song === null) return null

  if (song.status === "failed") {
    return (
      <p className="text-base text-alarm" title={song.errorDetail}>
        That one didn&apos;t make it.
        {song.errorDetail !== undefined ? (
          <span className="block truncate text-sm text-dim">{song.errorDetail}</span>
        ) : null}
      </p>
    )
  }

  if (song.status === "complete") return null

  const stageIndex =
    song.status === "running" && song.stage !== undefined ? stages.indexOf(song.stage) : -1
  const percent = song.status === "running" ? stageProgressPercent(song.stageProgress) : null
  const caption =
    stageIndex >= 0 && song.stage !== undefined
      ? `${stageLabels[song.stage]} · step ${stageIndex + 1} of ${stages.length}`
      : queueDepth !== null && queueDepth > 0
        ? `Queued · ${queueDepth} ahead in line`
        : "Queued"

  return (
    <div className="min-w-0 space-y-2" role="status">
      <p className="truncate text-base text-snow">
        {caption}
        {percent !== null ? (
          <span className="ml-2 font-mono text-dim tabular-nums">{Math.round(percent)}%</span>
        ) : null}
      </p>
      <div className="flex gap-1">
        {stages.map((stage, index) => (
          <span
            key={stage}
            title={stageLabels[stage]}
            className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink inset-shadow-well"
          >
            {index < stageIndex ? <span className="absolute inset-0 bg-orange" /> : null}
            {index === stageIndex ? (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 bg-orange transition-[width] duration-700 ease-out",
                  percent === null && "pending-breathe",
                )}
                style={{ width: `${percent ?? 100}%` }}
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}

type EnhanceButtonProps = Readonly<{
  kind: EnhanceScope
  pending: boolean
  disabled: boolean
  onEnhance: (kind: EnhanceScope) => void
}>

const EnhanceButton: React.FC<EnhanceButtonProps> = ({ kind, pending, disabled, onEnhance }) => (
  <button
    type="button"
    onClick={() => onEnhance(kind)}
    disabled={disabled}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-base font-medium text-orange transition-colors",
      "hover:bg-panel-raised hover:text-orange-soft disabled:cursor-default disabled:opacity-50",
      pending && "pending-breathe",
    )}
    title={
      kind === "style"
        ? "Have AI sharpen the style you described"
        : "Have AI extend, rework, or write the lyrics"
    }
  >
    <Sparkles className="size-4" aria-hidden />
    {pending ? "Enhancing…" : "Enhance"}
  </button>
)

export const SongForm: React.FC<SongFormProps> = ({
  activeSong,
  queueDepth,
  style,
  lyrics,
  cfgScale,
  aiEnabled,
  enhancing,
  enhanceError,
  randomPending,
  onStyleChange,
  onLyricsChange,
  onCfgScaleChange,
  onCreated,
  onBlocked,
  onEnhance,
  onRandom,
  onToggleFullAuto,
}) => {
  const createSong = useCreateSongMutation(onBlocked)
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
        cfgScale,
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

  const createError =
    createSong.error !== null && blockedModelsFromError(createSong.error) === null
      ? createSong.error.message
      : null

  return (
    <section
      aria-labelledby="request-title"
      className="panel panel-rise mx-auto w-full max-w-5xl overflow-hidden rounded-3xl pointer-events-auto"
    >
      <header className="tweed flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-8">
        <h1 id="request-title" className="text-5xl leading-display">
          <Wordmark />
        </h1>

        {aiEnabled ? (
          <button
            type="button"
            role="switch"
            aria-checked={false}
            onClick={onToggleFullAuto}
            title="Hide the inputs, then generate and play songs forever"
            className="text-stage flex items-center gap-3 rounded-xl px-3 py-2 text-base font-semibold text-snow transition-colors hover:bg-ink/40"
          >
            Full auto
            <span className="switch">
              <span className="switch-knob" />
            </span>
          </button>
        ) : null}
      </header>

      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex min-h-9 items-center justify-between">
            <Label htmlFor="lyrics-input" className="text-base font-semibold text-snow">
              Lyrics
            </Label>
            {aiEnabled ? (
              <EnhanceButton
                kind="lyrics"
                pending={enhancing.includes("lyrics")}
                disabled={enhancing.includes("lyrics")}
                onEnhance={onEnhance}
              />
            ) : null}
          </div>
          <div className="field px-4 py-3">
            <Textarea
              id="lyrics-input"
              rows={12}
              value={lyrics}
              onChange={(event) => onLyricsChange(event.target.value)}
              placeholder={"[Verse]\nWrite the words here\n\n[Chorus]\n…"}
              className="h-[12lh] w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 font-mono text-base leading-relaxed text-snow shadow-none outline-none placeholder:text-faint focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex min-h-9 items-center justify-between">
              <Label htmlFor="style-input" className="text-base font-semibold text-snow">
                Style
              </Label>
              {aiEnabled ? (
                <EnhanceButton
                  kind="style"
                  pending={enhancing.includes("style")}
                  disabled={enhancing.includes("style")}
                  onEnhance={onEnhance}
                />
              ) : null}
            </div>
            <div className="field px-4 py-3">
              <Textarea
                id="style-input"
                rows={4}
                value={style}
                onChange={(event) => onStyleChange(event.target.value)}
                placeholder="Genre, voice, instruments, tempo"
                className="max-h-[8lh] min-h-[4lh] w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 text-base leading-relaxed text-snow shadow-none outline-none placeholder:text-faint focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={onFileChange}
              className="hidden"
              aria-label="Upload a reference song"
            />
            {reference === null ? (
              <Button
                type="button"
                variant="secondary"
                onClick={pickFile}
                disabled={uploadReference.isPending}
                title="Upload a song whose melody guides a cover"
                className={cn("border border-edge", uploadReference.isPending && "pending-breathe")}
              >
                <Paperclip aria-hidden />
                {uploadReference.isPending ? "Uploading…" : "Add reference song"}
              </Button>
            ) : (
              <div className="panel-raised flex items-center gap-3 rounded-xl py-2 pr-2 pl-3">
                <Paperclip className="size-5 shrink-0 text-orange" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-base" title={reference.filename}>
                  {reference.filename}
                </span>
                <button
                  type="button"
                  onClick={clearReference}
                  aria-label="Remove reference song"
                  title="Remove reference song"
                  className="key size-9"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            {uploadFailed ? (
              <p className="text-base text-alarm">The upload failed. Try another audio file.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex min-h-9 items-center justify-between">
              <Label htmlFor="cfg-scale-input" className="text-base font-semibold text-snow">
                Prompt Adherence ({formatCfgScale(cfgScale)})
              </Label>
            </div>
            <div className="relative">
              <input
                id="cfg-scale-input"
                type="range"
                min={cfgScaleMin}
                max={cfgScaleMax}
                step={cfgScaleStep}
                value={cfgScale}
                onChange={(event) => onCfgScaleChange(event.target.valueAsNumber)}
                aria-describedby="cfg-scale-ends"
                title="1.0 is the default and skips guidance. Higher follows the style and lyrics more closely; lower gives the model more freedom."
                className="slider"
                style={
                  {
                    "--sweet-low": `${cfgScalePercent(cfgScaleSweetLow)}%`,
                    "--sweet-high": `${cfgScalePercent(cfgScaleSweetHigh)}%`,
                  } as React.CSSProperties
                }
              />
            </div>
            <div id="cfg-scale-ends" className="flex items-center justify-between text-sm text-dim">
              <span>Loose</span>
              <span>Strict</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="mx-6 flex flex-wrap items-center justify-between gap-4 border-t border-line py-6 sm:mx-8">
        <div className="min-w-0 flex-1 basis-64">
          <StageMeter song={activeSong} stages={stages} queueDepth={queueDepth} />
        </div>

        <div className="flex items-center gap-3">
          {aiEnabled ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onRandom}
              disabled={randomPending}
              title="AI writes a song, Yuekbox plays it"
              className={cn("border border-edge", randomPending && "pending-breathe")}
            >
              <Dices aria-hidden />
              {randomPending ? "Rolling…" : "Random"}
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={submit}
            disabled={!canGenerate}
            title={canGenerate ? "Generate this song" : "Fill in lyrics and style first"}
            className="btn-orange"
          >
            <Disc3 aria-hidden className={cn(createSong.isPending && "animate-spin")} />
            {createSong.isPending ? "Sending…" : "Generate song"}
          </Button>
        </div>
      </footer>

      {enhanceError !== null || createError !== null ? (
        <div className="space-y-1 px-6 pb-6 sm:px-8">
          {enhanceError !== null ? <p className="text-base text-alarm">{enhanceError}</p> : null}
          {createError !== null ? <p className="text-base text-alarm">{createError}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
