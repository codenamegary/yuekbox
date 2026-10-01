import * as React from "react"
import {
  AudioWaveform,
  HardDrive,
  Infinity as InfinityIcon,
  Library,
  ListOrdered,
  LucideIcon,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Tornado,
  Waves,
} from "lucide-react"
import { EnhanceScope } from "contracts/http/ai"
import { MissingModel } from "contracts/http/models"
import { Song, SongStage } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/Button"
import { AiSettings } from "@/ai/AiSettings"
import { useAiConfigQuery } from "@/ai/ai.queries"
import { useEnhanceMutation, useRandomSongMutation } from "@/ai/ai.mutations"
import { MissingModelDialog } from "@/models/MissingModelDialog"
import { ModelsPanel } from "@/models/ModelsPanel"
import { GeneratingOverlay } from "./GeneratingOverlay"
import { LoadSongDialog } from "./LoadSongDialog"
import { LyricOverlay } from "./LyricOverlay"
import { SongForm } from "./SongForm"
import { SongList } from "./SongList"
import { SongPlayer } from "./SongPlayer"
import { VisualizationCanvas } from "./VisualizationCanvas"
import { WinampCanvas } from "./WinampCanvas"
import { createAudioEngine } from "./songs.audio.engine"
import { Draft, shouldConfirmLoad } from "./songs.draft"
import { buildLyricCues } from "./songs.lyrics.timing"
import { writerHidden } from "./songs.player"
import { useDeleteSongMutation, useRerollVisualizationMutation } from "./songs.mutations"
import {
  isActiveStatus,
  pickActiveSong,
  useSongQuery,
  useSongsQuery,
  useStatusQuery,
  useVisualizationQuery,
} from "./songs.queries"
import { useFullAuto } from "./songs.fullauto"
import { FullAutoPhase } from "./songs.fullauto.machine"
import { initialOverlayState, overlayCloseDelayMs, stepOverlay } from "./songs.overlay.machine"
import { createVisualizationEngine, VisualizationSong } from "./songs.visualization"
import { createWinampEngine, TripMode } from "./songs.winamp.engine"

const tripModes: ReadonlyArray<{ mode: TripMode; Icon: LucideIcon; title: string }> = [
  { mode: 0, Icon: Tornado, title: "Hyperspace vortex" },
  { mode: 1, Icon: AudioWaveform, title: "Phosphor oscilloscope" },
  { mode: 2, Icon: Waves, title: "Chromatic plasma" },
  { mode: 3, Icon: Sparkles, title: "Stardust vortex" },
]

const fullAutoStatusLabels: Readonly<Record<FullAutoPhase, string>> = {
  idle: "Warming up the tubes",
  generating: "Writing the next one…",
  playing: "On air. The next one is in the oven.",
  starved: "The machine is catching up…",
}

const ToolbarDivider: React.FC = () => (
  <span aria-hidden className="mx-1 h-6 w-px bg-cabinet-edge" />
)

export const SongsPage: React.FC = () => {
  const [audio] = React.useState(createAudioEngine)
  const [winamp] = React.useState(() =>
    createWinampEngine({
      bins: () => audio.bins,
      isPlaying: () => audio.isPlaying(),
      time: audio.currentTime,
    }),
  )
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [modelsOpen, setModelsOpen] = React.useState(false)
  const [blockedModels, setBlockedModels] = React.useState<readonly MissingModel[] | null>(null)
  const [overlay, dispatchOverlay] = React.useReducer(stepOverlay, initialOverlayState)
  const [trackedSong, setTrackedSong] = React.useState<Song | null>(null)
  const [mode, setMode] = React.useState<TripMode>(0)
  const [draft, setDraft] = React.useState<Draft>({ style: "", lyrics: "" })
  const [loadCandidate, setLoadCandidate] = React.useState<Song | null>(null)
  const [fullAuto, setFullAuto] = React.useState(false)
  const [playSignal, setPlaySignal] = React.useState(0)
  const [audioPlaying, setAudioPlaying] = React.useState(false)
  const pendingAutoPlay = React.useRef<string | null>(null)

  const songsQuery = useSongsQuery()
  const statusQuery = useStatusQuery()
  const aiConfigQuery = useAiConfigQuery()
  const aiEnabled = aiConfigQuery.data?.enabled === true
  const songs = songsQuery.data?.items ?? []
  const activeFromList = pickActiveSong(songs, activeId)
  const songQuery = useSongQuery(activeFromList?.id ?? null)
  const activeSong: Song | null = songQuery.data ?? activeFromList
  const overlayVisible = overlay.phase !== "hidden"
  const trackedSongLive =
    trackedSong === null
      ? null
      : activeSong?.id === trackedSong.id
        ? activeSong
        : (songs.find((song) => song.id === trackedSong.id) ?? trackedSong)
  const overlaySong: Song | null =
    trackedSongLive ??
    (activeSong !== null && isActiveStatus(activeSong.status) ? activeSong : null) ??
    songs.find((song) => isActiveStatus(song.status)) ??
    activeSong
  const songIsActive = isActiveStatus(overlaySong?.status)
  const visualizationQuery = useVisualizationQuery(activeSong?.id ?? null)
  const deleteSong = useDeleteSongMutation()
  const rerollVisualization = useRerollVisualizationMutation()

  const [visualizationFailure, setVisualizationFailure] = React.useState<Readonly<{
    key: string
    detail: string
  }> | null>(null)
  const [visualizationEngine] = React.useState(() =>
    createVisualizationEngine({
      time: audio.currentTime,
      duration: audio.duration,
      isPlaying: audio.isPlaying,
      bins: () => audio.bins,
    }),
  )

  const activeSongId = activeSong?.id ?? null
  const activeSongStyle = activeSong?.style ?? ""
  const activeSongLyrics = activeSong?.lyrics ?? ""
  const activeSongSeed = activeSong?.seed ?? 0
  const visualizationSong = React.useMemo<VisualizationSong | null>(
    () =>
      activeSongId === null
        ? null
        : {
            id: activeSongId,
            style: activeSongStyle,
            lyrics: activeSongLyrics,
            seed: activeSongSeed,
          },
    [activeSongId, activeSongStyle, activeSongLyrics, activeSongSeed],
  )

  const lyricCues = React.useMemo(
    () =>
      activeSong === null || activeSong.status !== "complete"
        ? []
        : buildLyricCues({
            lyrics: activeSong.lyrics,
            scoreAbc: activeSong.scoreAbc ?? null,
            cues: activeSong.calibration?.cues ?? null,
            durationSeconds: activeSong.durationSeconds ?? 0,
          }),
    [activeSong],
  )

  const visualization = visualizationQuery.data?.visualization ?? null
  const analysis = visualizationQuery.data?.analysis ?? null
  const visualizationCode = visualization?.code ?? null
  const visualizationKey = `${activeSongId ?? "none"}:${visualization?.checksum ?? "none"}`
  const visualizationFailed = visualizationFailure?.key === visualizationKey
  const visualRunning = visualizationCode !== null && !visualizationFailed

  const handleVisualizationFailure = React.useCallback(
    (detail: string) => {
      setVisualizationFailure({ key: visualizationKey, detail })
    },
    [visualizationKey],
  )

  const poke = React.useCallback(() => {
    winamp.pulse(1.6)
  }, [winamp])

  const typing = React.useCallback(() => {
    winamp.pulse(0.3)
  }, [winamp])

  const applyDraft = React.useCallback((next: Draft) => {
    setDraft(next)
  }, [])

  const cancelLoad = React.useCallback(() => {
    setLoadCandidate(null)
  }, [])

  const confirmLoad = React.useCallback(() => {
    if (loadCandidate !== null) {
      applyDraft({ style: loadCandidate.style, lyrics: loadCandidate.lyrics })
    }
    setLoadCandidate(null)
  }, [applyDraft, loadCandidate])

  const lastStage = React.useRef<SongStage | null>(null)
  const activeStage = activeSong?.stage ?? null
  React.useEffect(() => {
    if (activeStage !== null && activeStage !== lastStage.current) {
      winamp.pulse(1.4)
    }
    lastStage.current = activeStage
  }, [activeStage, winamp])

  const writerIsHidden = writerHidden(audioPlaying, activeSong?.status ?? null)

  React.useEffect(() => {
    return audio.subscribe(() => setAudioPlaying(audio.isPlaying()))
  }, [audio])

  React.useEffect(() => {
    if (pendingAutoPlay.current === null || activeSong === null) return
    if (activeSong.id !== pendingAutoPlay.current || activeSong.status !== "complete") return
    void audio.play().catch(() => {})
    pendingAutoPlay.current = null
  }, [activeSong, playSignal, audio])

  // Dismissing also forgets the tracked Song so a later sigil show starts fresh.
  const dismissOverlay = React.useCallback(() => {
    dispatchOverlay({ type: "dismiss" })
    setTrackedSong(null)
  }, [])

  React.useEffect(() => {
    if (overlay.phase !== "closing") return
    const timer = window.setTimeout(() => {
      setTrackedSong(null)
      dispatchOverlay({ type: "closeElapsed" })
    }, overlayCloseDelayMs)
    return () => window.clearTimeout(timer)
  }, [overlay.phase])

  const overlayStatus = overlaySong?.status ?? null
  React.useEffect(() => {
    if (overlayStatus === "complete") dispatchOverlay({ type: "songComplete" })
    if (overlayStatus === "failed") dispatchOverlay({ type: "songFailed" })
  }, [overlayStatus])

  const handleCreated = (song: Song) => {
    setActiveId(song.id)
    setTrackedSong(song)
    pendingAutoPlay.current = song.id
    dispatchOverlay({ type: "generate" })
    poke()
  }

  // A blocked generation carries the server's missing models; the dialog reads
  // them as-is instead of guessing which models are absent.
  const handleBlocked = React.useCallback(
    (models: readonly MissingModel[]) => {
      setBlockedModels(models)
      poke()
    },
    [poke],
  )

  const handleSelect = (songId: string) => {
    setActiveId(songId)
    const selected = songs.find((song) => song.id === songId)
    if (selected !== undefined) {
      if (selected.status === "complete") {
        pendingAutoPlay.current = songId
      }
      if (shouldConfirmLoad(draft, selected)) {
        setLoadCandidate(selected)
      } else {
        applyDraft({ style: selected.style, lyrics: selected.lyrics })
      }
    }
    setHistoryOpen(false)
    poke()
  }

  const handleDelete = (songId: string) => {
    deleteSong.mutate(songId)
    if (activeId === songId) {
      setActiveId(null)
    }
    poke()
  }

  const handlePlayNow = React.useCallback(
    (songId: string) => {
      setActiveId(songId)
      pendingAutoPlay.current = songId
      setPlaySignal((signal) => signal + 1)
      poke()
    },
    [poke],
  )

  const handleWatch = React.useCallback((songId: string) => {
    setActiveId((current) => (current === songId ? current : songId))
  }, [])

  const fullAutoActive = fullAuto && aiEnabled

  const rotateVisualizer = React.useCallback(() => {
    setMode((current) => ((current + 1) % tripModes.length) as TripMode)
    poke()
  }, [poke])

  const visualOnTrack = React.useRef(false)
  React.useEffect(() => {
    visualOnTrack.current = visualRunning
  }, [visualRunning])

  const handleTrackEnded = React.useCallback(() => {
    if (!visualOnTrack.current) rotateVisualizer()
  }, [rotateVisualizer])

  const aiConfig = aiConfigQuery.data
  const visualsConfigured = aiEnabled && (aiConfig?.visuals.model.trim() ?? "") !== ""
  const visualizationFailedServer = visualization?.status === "failed"
  const showVisualizationBadge =
    visualsConfigured && (visualizationFailed || visualizationFailedServer)
  const visualizationDetail = visualizationFailed
    ? (visualizationFailure?.detail ?? null)
    : visualizationFailedServer
      ? (visualization.errorDetail ?? null)
      : null
  const rerolling =
    rerollVisualization.isPending ||
    visualization?.status === "rerolling" ||
    visualization?.status === "pending"
  const rerollTitle = !visualsConfigured
    ? "AI visuals are off — click to open settings"
    : visualizationFailed || visualizationFailedServer
      ? "Reroll the failed visualization"
      : "Reroll Visualization"
  const rerollVisualizationNow = () => {
    if (!visualsConfigured) {
      setSettingsOpen(true)
      poke()
      return
    }
    if (activeSongId === null) return
    rerollVisualization.mutate(activeSongId)
    poke()
  }
  const enhance = useEnhanceMutation((kind, text) => {
    if (kind === "style") {
      applyDraft({ style: text, lyrics: draft.lyrics })
    } else {
      applyDraft({ style: draft.style, lyrics: text })
    }
    poke()
  })

  const handleEnhance = (kind: EnhanceScope) => {
    if (aiConfig === undefined) return
    enhance.mutate({ kind, style: draft.style, lyrics: draft.lyrics })
    poke()
  }

  const manualRandom = useRandomSongMutation(handleCreated, handleBlocked)

  const autoRandom = useRandomSongMutation(() => {}, handleBlocked)
  const requestRandom = React.useCallback(async () => {
    try {
      const song = await autoRandom.mutateAsync()
      return song.id
    } catch {
      return null
    }
  }, [autoRandom])

  const fullAutoState = useFullAuto({
    enabled: fullAutoActive,
    audio,
    activeSongId: activeSong?.id ?? null,
    songs,
    onWatch: handleWatch,
    onPlay: handlePlayNow,
    onTrackEnded: handleTrackEnded,
    requestRandom,
  })

  return (
    <>
      {visualRunning && visualizationSong !== null && visualizationCode !== null ? (
        <VisualizationCanvas
          engine={visualizationEngine}
          song={visualizationSong}
          code={visualizationCode}
          cues={lyricCues}
          analysis={analysis}
          onFailure={handleVisualizationFailure}
        />
      ) : (
        <WinampCanvas engine={winamp} mode={mode} analysis={analysis} />
      )}
      <div className="cabinet-vignette" />

      {!fullAutoActive ? (
        <div className="fixed top-6 right-6 z-20 flex flex-col items-end gap-2 pointer-events-auto">
          <nav
            aria-label="Visuals and panels"
            className="cabinet flex items-center gap-1.5 rounded-2xl p-2"
          >
            <button
              type="button"
              onClick={rerollVisualizationNow}
              disabled={rerolling}
              className={cn("key", rerolling && "key-lit")}
              title={rerollTitle}
              aria-label={rerollTitle}
            >
              <RefreshCw
                className={cn("size-5", rerolling && "animate-spin motion-reduce:animate-none")}
              />
            </button>
            <ToolbarDivider />
            {tripModes.map((trip) => (
              <button
                key={trip.mode}
                type="button"
                onClick={() => {
                  setMode(trip.mode)
                  winamp.pulse(0.8)
                }}
                className={cn("key", mode === trip.mode && "key-lit")}
                title={trip.title}
                aria-label={trip.title}
                aria-pressed={mode === trip.mode}
              >
                <trip.Icon className="size-5" />
              </button>
            ))}
            <ToolbarDivider />
            <button
              type="button"
              onClick={() => {
                if (overlayVisible) {
                  dismissOverlay()
                } else {
                  setTrackedSong(overlaySong)
                  dispatchOverlay({ type: "show" })
                }
                poke()
              }}
              disabled={!overlayVisible && !songIsActive}
              className={cn("key", overlayVisible && "key-lit")}
              title={overlayVisible ? "Hide generation progress" : "Show generation progress"}
              aria-label={overlayVisible ? "Hide generation progress" : "Show generation progress"}
            >
              <ListOrdered className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setHistoryOpen((open) => !open)
                poke()
              }}
              className={cn("key", historyOpen && "key-lit")}
              title="Song history"
              aria-label="Song history"
              aria-pressed={historyOpen}
            >
              <Library className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setModelsOpen(true)
                poke()
              }}
              className={cn("key", modelsOpen && "key-lit")}
              title="Models: point at a copy or download one"
              aria-label="Models"
            >
              <HardDrive className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(true)
                poke()
              }}
              className={cn("key", settingsOpen && "key-lit")}
              title="AI settings: pick endpoints, models, and effort"
              aria-label="AI settings"
            >
              <SlidersHorizontal className="size-5" />
            </button>
          </nav>
          {showVisualizationBadge ? (
            <p className="cabinet flex max-w-sm items-center gap-2 rounded-xl px-3 py-2 text-sm">
              <span className="shrink-0 font-semibold text-amber">The visual failed.</span>
              {visualizationDetail !== null ? (
                <span className="truncate text-dim" title={visualizationDetail}>
                  {visualizationDetail}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <main className="relative z-10 w-full h-full flex flex-col px-6 pt-28 pb-6 sm:px-10 sm:pb-10 pointer-events-none">
        {!fullAutoActive ? (
          <div
            className={cn(
              "flex-1 min-h-0 overflow-y-auto transition-[opacity,visibility,transform] duration-700 ease-out",
              (writerIsHidden || overlayVisible) &&
                "invisible opacity-0 -translate-y-2 pointer-events-none",
            )}
          >
            <div className="min-h-full flex flex-col justify-center">
              <SongForm
                activeSong={activeSong}
                queueDepth={statusQuery.data?.queueDepth ?? null}
                style={draft.style}
                lyrics={draft.lyrics}
                aiEnabled={aiEnabled}
                enhancing={enhance.isPending ? (enhance.variables?.kind ?? null) : null}
                enhanceError={enhance.error?.message ?? null}
                randomPending={manualRandom.isPending}
                onStyleChange={(value) => {
                  applyDraft({ style: value, lyrics: draft.lyrics })
                  typing()
                }}
                onLyricsChange={(value) => {
                  applyDraft({ style: draft.style, lyrics: value })
                  typing()
                }}
                onCreated={handleCreated}
                onBlocked={handleBlocked}
                onEnhance={handleEnhance}
                onRandom={() => {
                  manualRandom.mutate()
                  poke()
                }}
                onToggleFullAuto={() => {
                  setFullAuto((on) => !on)
                  setHistoryOpen(false)
                  setSettingsOpen(false)
                  poke()
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {fullAutoActive ? (
          <div className="cabinet mx-auto flex shrink-0 items-center gap-4 rounded-2xl py-2 pr-2 pl-4 pointer-events-auto">
            <InfinityIcon className="size-6 shrink-0 text-amber" aria-hidden />
            <p className="text-base">
              <span className="font-semibold text-ivory">Full auto</span>
              <span className="text-dim"> · {fullAutoStatusLabels[fullAutoState.phase]}</span>
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFullAuto(false)
                poke()
              }}
            >
              Exit full auto
            </Button>
          </div>
        ) : null}

        <SongPlayer song={activeSong} engine={audio} />
      </main>

      <LyricOverlay cues={lyricCues} engine={audio} muted={visualRunning} />

      <GeneratingOverlay
        song={overlaySong}
        visible={overlayVisible}
        queueDepth={statusQuery.data?.queueDepth ?? null}
        onDismiss={dismissOverlay}
      />

      <LoadSongDialog song={loadCandidate} onCancel={cancelLoad} onConfirm={confirmLoad} />

      {settingsOpen ? <AiSettings onClose={() => setSettingsOpen(false)} /> : null}

      {modelsOpen ? <ModelsPanel onClose={() => setModelsOpen(false)} /> : null}

      {blockedModels !== null && blockedModels.length > 0 ? (
        <MissingModelDialog models={blockedModels} onClose={() => setBlockedModels(null)} />
      ) : null}

      <SongList
        open={historyOpen}
        songs={songs}
        activeId={activeSong?.id ?? null}
        status={statusQuery.data}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  )
}
