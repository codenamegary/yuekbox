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
import { blockedModelsFromError } from "@/models/models.problems"
import { useCreateSongMutation, useUploadReferenceMutation } from "./songs.mutations"
import { stageLabels, stageOrderFor, stageProgressPercent } from "./songs.stages"

type SongFormProps = Readonly<{
  activeSong: Song | null
  queueDepth: number | null
  style: string
  lyrics: string
  aiEnabled: boolean
  enhancing: EnhanceScope | null
  enhanceError: string | null
  randomPending: boolean
  onStyleChange: (value: string) => void
  onLyricsChange: (value: string) => void
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
      <p className="truncate text-base text-ivory">
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
            className="relative h-2 flex-1 overflow-hidden rounded-full bg-cabinet-sunken shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]"
          >
            {index < stageIndex ? <span className="absolute inset-0 bg-amber" /> : null}
            {index === stageIndex ? (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 bg-amber transition-[width] duration-700 ease-out",
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
      "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-base font-medium text-amber transition-colors",
      "hover:bg-cabinet-raised hover:text-amber-soft disabled:cursor-wait disabled:opacity-50",
      pending && "pending-breathe",
    )}
    title={
      kind === "style"
        ? "Have AI sharpen the style you described"
        : "Have AI extend, rework, or write the lyrics"
    }
  >
    <Sparkles className="size-4" aria-hidden />
    {pending ? "Meddling…" : "Let AI meddle"}
  </button>
)

export const SongForm: React.FC<SongFormProps> = ({
  activeSong,
  queueDepth,
  style,
  lyrics,
  aiEnabled,
  enhancing,
  enhanceError,
  randomPending,
  onStyleChange,
  onLyricsChange,
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
      className="cabinet panel-rise mx-auto w-full max-w-5xl rounded-3xl p-6 pointer-events-auto sm:p-8"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            id="request-title"
            className="font-display text-6xl leading-[0.85] font-black tracking-tight text-amber uppercase"
          >
            Yuekbox
          </h1>
          <p className="mt-2 text-base text-dim">
            The jukebox that writes its own records. Results may vary.
          </p>
        </div>

        {aiEnabled ? (
          <button
            type="button"
            role="switch"
            aria-checked={false}
            onClick={onToggleFullAuto}
            title="Hide the inputs, then generate and play songs forever"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-base font-medium text-ivory transition-colors hover:bg-cabinet-raised"
          >
            Full auto
            <span className="switch">
              <span className="switch-knob" />
            </span>
          </button>
        ) : null}
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex min-h-9 items-center justify-between">
            <Label htmlFor="lyrics-input" className="text-base font-semibold text-ivory">
              Lyrics
            </Label>
            {aiEnabled ? (
              <EnhanceButton
                kind="lyrics"
                pending={enhancing === "lyrics"}
                disabled={enhancing !== null}
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
              className="h-[12lh] w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 font-mono text-base leading-relaxed text-ivory shadow-none placeholder:text-faint focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex min-h-9 items-center justify-between">
              <Label htmlFor="style-input" className="text-base font-semibold text-ivory">
                Style
              </Label>
              {aiEnabled ? (
                <EnhanceButton
                  kind="style"
                  pending={enhancing === "style"}
                  disabled={enhancing !== null}
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
                className="max-h-[8lh] min-h-[4lh] w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 text-base leading-relaxed text-ivory shadow-none placeholder:text-faint focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold text-ivory">Reference song</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={onFileChange}
              className="hidden"
              aria-label="Upload a reference song"
            />
            {reference === null ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pickFile}
                  disabled={uploadReference.isPending}
                  className={cn(
                    "border border-cabinet-edge",
                    uploadReference.isPending && "pending-breathe",
                  )}
                >
                  <Paperclip aria-hidden />
                  {uploadReference.isPending ? "Uploading…" : "Attach audio"}
                </Button>
                <span className="text-base text-dim">Optional. Its melody guides a cover.</span>
              </div>
            ) : (
              <div className="cabinet-raised flex items-center gap-3 rounded-xl py-2 pr-2 pl-3">
                <Paperclip className="size-5 shrink-0 text-amber" aria-hidden />
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
        </div>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-cabinet-line pt-6">
        <div className="min-w-0 flex-1 basis-64">
          <StageMeter song={activeSong} stages={stages} queueDepth={queueDepth} />
        </div>

        <div className="flex items-center gap-3">
          {aiEnabled ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={onRandom}
              disabled={randomPending}
              title="AI writes a song, Yuekbox plays it"
              className={cn("border border-cabinet-edge", randomPending && "pending-breathe")}
            >
              <Dices aria-hidden />
              {randomPending ? "Rolling…" : "Surprise me"}
            </Button>
          ) : null}

          <Button
            type="button"
            size="lg"
            onClick={submit}
            disabled={!canGenerate}
            title={canGenerate ? "Generate this song" : "Fill in lyrics and style first"}
            className={cn(
              "text-ivory hover:brightness-110",
              "bg-[linear-gradient(180deg,var(--color-cherry-bright),var(--color-cherry))]",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_0_rgba(0,0,0,0.5)] active:translate-y-px",
            )}
          >
            <Disc3 aria-hidden className={cn(createSong.isPending && "animate-spin")} />
            {createSong.isPending ? "Pressing…" : "Generate song"}
          </Button>
        </div>
      </footer>

      {enhanceError !== null || createError !== null ? (
        <div className="mt-4 space-y-1">
          {enhanceError !== null ? <p className="text-base text-alarm">{enhanceError}</p> : null}
          {createError !== null ? <p className="text-base text-alarm">{createError}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
