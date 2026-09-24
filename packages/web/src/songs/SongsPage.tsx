import * as React from "react"
import { EnhanceScope } from "contracts/http/ai"
import { Song, SongStage } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { AiSettings } from "@/ai/AiSettings"
import { useAiConfigQuery } from "@/ai/ai.queries"
import { useEnhanceMutation, useRandomSongMutation } from "@/ai/ai.mutations"
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

const tripModes: ReadonlyArray<{ mode: TripMode; glyph: string; title: string }> = [
  { mode: 0, glyph: "⏣", title: "Hyperspace Vortex (Milkdrop)" },
  { mode: 1, glyph: "∿", title: "Phosphor Oscilloscope" },
  { mode: 2, glyph: "❂", title: "Chromatic Plasma" },
  { mode: 3, glyph: "✧", title: "Quantum Stardust Vortex" },
]

const fullAutoStatusLabels: Readonly<Record<FullAutoPhase, string>> = {
  idle: "waking up",
  generating: "dreaming up the next one…",
  playing: "on air — next one brewing",
  starved: "the spirits are catching up…",
}

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

  const manualRandom = useRandomSongMutation(handleCreated)

  const autoRandom = useRandomSongMutation(() => {})
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
      <div className="tech-vignette" />

      {!fullAutoActive ? (
        <div className="fixed top-8 right-8 z-20 flex items-center gap-2.5 pointer-events-auto">
          <div className="relative">
            <button
              type="button"
              onClick={rerollVisualizationNow}
              disabled={rerolling}
              className={cn(
                "alien-sigil disabled:opacity-40 disabled:pointer-events-none",
                rerolling && "active",
              )}
              title={rerollTitle}
            >
              <span
                className={cn(
                  "inline-block leading-none",
                  rerolling && "animate-spin motion-reduce:animate-none",
                )}
              >
                ↻
              </span>
            </button>
            {showVisualizationBadge ? (
              <span className="absolute right-0 top-full mt-1.5 flex items-center gap-2 whitespace-nowrap">
                <span className="font-mono text-3xs tracking-[0.25em] uppercase text-amber-200/70">
                  visual failed
                </span>
                {visualizationDetail !== null ? (
                  <span
                    className="max-w-[14rem] truncate font-mono text-3xs text-white/30"
                    title={visualizationDetail}
                  >
                    {visualizationDetail}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          <div className="w-px h-4 bg-white/10 mx-1" />
          {tripModes.map((trip) => (
            <button
              key={trip.mode}
              type="button"
              onClick={() => {
                setMode(trip.mode)
                winamp.pulse(0.8)
              }}
              className={cn("alien-sigil", mode === trip.mode && "active")}
              title={trip.title}
            >
              {trip.glyph}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
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
            className={cn(
              "alien-sigil disabled:opacity-40 disabled:pointer-events-none",
              overlayVisible && "active",
            )}
            title={overlayVisible ? "Hide the generating reel" : "Show the generating reel"}
          >
            ☰
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryOpen((open) => !open)
              poke()
            }}
            className={cn("alien-sigil", historyOpen && "active")}
            title="Song History (Click to pop out)"
          >
            ◷
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true)
              poke()
            }}
            className={cn("alien-sigil", settingsOpen && "active")}
            title="AI Settings — pick agents, models, and effort"
          >
            ⚙
          </button>
        </div>
      ) : null}

      <main className="relative z-10 w-full h-full flex flex-col p-8 sm:p-14 md:p-16 pointer-events-none">
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
          <div className="shrink-0 flex items-center justify-center gap-4 pb-3 max-w-2xl mx-auto w-full pointer-events-auto">
            <span className="font-mono text-3xs tracking-[0.3em] uppercase text-cyan-200/60">
              ∞ full auto · {fullAutoStatusLabels[fullAutoState.phase]}
            </span>
            <button
              type="button"
              onClick={() => {
                setFullAuto(false)
                poke()
              }}
              className="font-mono text-3xs tracking-[0.25em] uppercase text-white/35 hover:text-white transition-colors"
              title="Leave full auto"
            >
              exit ✕
            </button>
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
