import * as React from "react"
import { EnhanceScope } from "contracts/http/ai"
import { Song, SongStage } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { AiSettings } from "@/ai/AiSettings"
import { useAiConfigQuery } from "@/ai/ai.queries"
import { useEnhanceMutation, useRandomSongMutation } from "@/ai/ai.mutations"
import { LoadSongDialog } from "./LoadSongDialog"
import { LyricOverlay } from "./LyricOverlay"
import { SongForm } from "./SongForm"
import { SongList } from "./SongList"
import { SongPlayer, SongVisualizationControls } from "./SongPlayer"
import { VisualizationCanvas } from "./VisualizationCanvas"
import { WinampCanvas } from "./WinampCanvas"
import { createAudioEngine } from "./songs.audio.engine"
import { Draft, shouldConfirmLoad } from "./songs.draft"
import { buildLyricCues } from "./songs.lyrics.timing"
import { useDeleteSongMutation, useRerollVisualizationMutation } from "./songs.mutations"
import {
  pickActiveSong,
  useSongQuery,
  useSongsQuery,
  useStatusQuery,
  useVisualizationQuery,
} from "./songs.queries"
import { useFullAuto } from "./songs.fullauto"
import { FullAutoPhase } from "./songs.fullauto.machine"
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
    }),
  )
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [mode, setMode] = React.useState<TripMode>(0)
  const [draft, setDraft] = React.useState<Draft>({ style: "", lyrics: "" })
  const [loadCandidate, setLoadCandidate] = React.useState<Song | null>(null)
  const [fullAuto, setFullAuto] = React.useState(false)
  const [playSignal, setPlaySignal] = React.useState(0)
  const [audioPlaying, setAudioPlaying] = React.useState(false)
  const [editorEngaged, setEditorEngaged] = React.useState(false)
  const pendingAutoPlay = React.useRef<string | null>(null)
  const wasPlaying = React.useRef(false)
  const formRegionRef = React.useRef<HTMLDivElement | null>(null)

  const songsQuery = useSongsQuery()
  const statusQuery = useStatusQuery()
  const aiConfigQuery = useAiConfigQuery()
  const aiEnabled = aiConfigQuery.data?.enabled === true
  const songs = songsQuery.data?.items ?? []
  const activeFromList = pickActiveSong(songs, activeId)
  const songQuery = useSongQuery(activeFromList?.id ?? null)
  const activeSong: Song | null = songQuery.data ?? activeFromList
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
            vocalSpans: activeSong.calibration?.spans ?? null,
            durationSeconds: activeSong.durationSeconds ?? 0,
          }),
    [activeSong],
  )

  const visualization = visualizationQuery.data ?? null
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

  const lyricsTakeover = audioPlaying && activeSong?.status === "complete"
  const editorDimmed = lyricsTakeover && !editorEngaged

  React.useEffect(() => {
    return audio.subscribe(() => setAudioPlaying(audio.isPlaying()))
  }, [audio])

  React.useEffect(() => {
    if (audioPlaying && !wasPlaying.current) {
      setEditorEngaged(false)
    }
    wasPlaying.current = audioPlaying
  }, [audioPlaying])

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const region = formRegionRef.current
      if (region !== null && event.target instanceof Node && region.contains(event.target)) return
      setEditorEngaged(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  React.useEffect(() => {
    if (pendingAutoPlay.current === null || activeSong === null) return
    if (activeSong.id !== pendingAutoPlay.current || activeSong.status !== "complete") return
    void audio.play().catch(() => {})
    pendingAutoPlay.current = null
  }, [activeSong, playSignal, audio])

  const handleCreated = (song: Song) => {
    setActiveId(song.id)
    pendingAutoPlay.current = song.id
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
  const visualizationControls: SongVisualizationControls = {
    configured: visualsConfigured,
    status: visualization?.status ?? null,
    failed: visualizationFailed,
    detail: visualizationFailed
      ? (visualizationFailure?.detail ?? null)
      : visualization?.status === "failed"
        ? (visualization.errorDetail ?? null)
        : null,
    rerolling:
      rerollVisualization.isPending ||
      visualization?.status === "rerolling" ||
      visualization?.status === "pending",
    onReroll: () => {
      if (!visualsConfigured) {
        setSettingsOpen(true)
        poke()
        return
      }
      if (activeSongId === null) return
      rerollVisualization.mutate(activeSongId)
      poke()
    },
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
          onFailure={handleVisualizationFailure}
        />
      ) : (
        <WinampCanvas engine={winamp} mode={mode} />
      )}
      <div className="tech-vignette" />

      {!fullAutoActive ? (
        <div className="fixed top-8 right-8 z-20 flex items-center gap-2.5 pointer-events-auto">
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
            ref={formRegionRef}
            className={cn(
              "flex-1 min-h-0 overflow-y-auto transition-opacity duration-700",
              editorDimmed && "opacity-[0.13]",
            )}
            onPointerDownCapture={() => setEditorEngaged(true)}
            onFocusCapture={() => setEditorEngaged(true)}
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
                  setEditorEngaged(false)
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

        <div className="shrink-0 pt-6">
          <SongPlayer
            song={activeSong}
            engine={audio}
            onPoke={poke}
            visualization={visualizationControls}
          />
        </div>
      </main>

      <LyricOverlay cues={lyricCues} engine={audio} receded={editorEngaged} muted={visualRunning} />

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
