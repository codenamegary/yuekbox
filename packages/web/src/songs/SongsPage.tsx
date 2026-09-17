import * as React from "react"
import { Song, SongStage } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { BrainEntity } from "./BrainEntity"
import { LoadSongDialog } from "./LoadSongDialog"
import { SongForm } from "./SongForm"
import { SongList } from "./SongList"
import { SongPlayer } from "./SongPlayer"
import { WinampCanvas } from "./WinampCanvas"
import { createAudioEngine } from "./songs.audio.engine"
import { createBrainEngine } from "./songs.brain.engine"
import { countWords, Draft, shouldConfirmLoad } from "./songs.draft"
import { useDeleteSongMutation } from "./songs.mutations"
import { pickActiveSong, useSongQuery, useSongsQuery, useStatusQuery } from "./songs.queries"
import { createWinampEngine, TripMode } from "./songs.winamp.engine"

const tripModes: ReadonlyArray<{ mode: TripMode; glyph: string; title: string }> = [
  { mode: 0, glyph: "⏣", title: "Hyperspace Vortex (Milkdrop)" },
  { mode: 1, glyph: "∿", title: "Phosphor Oscilloscope" },
  { mode: 2, glyph: "❂", title: "Chromatic Plasma" },
  { mode: 3, glyph: "✧", title: "Quantum Stardust Vortex" },
]

export const SongsPage: React.FC = () => {
  const [audio] = React.useState(createAudioEngine)
  const [winamp] = React.useState(() =>
    createWinampEngine({
      bins: () => audio.bins,
      isPlaying: () => audio.isPlaying(),
    }),
  )
  const [brain] = React.useState(() =>
    createBrainEngine({
      isPlaying: () => audio.isPlaying(),
      bins: () => audio.bins,
    }),
  )

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [mode, setMode] = React.useState<TripMode>(0)
  const [draft, setDraft] = React.useState<Draft>({ style: "", lyrics: "" })
  const [loadCandidate, setLoadCandidate] = React.useState<Song | null>(null)
  const pendingAutoPlay = React.useRef<string | null>(null)

  const songsQuery = useSongsQuery()
  const statusQuery = useStatusQuery()
  const songs = songsQuery.data?.items ?? []
  const activeFromList = pickActiveSong(songs, activeId)
  const songQuery = useSongQuery(activeFromList?.id ?? null)
  const activeSong: Song | null = songQuery.data ?? activeFromList
  const deleteSong = useDeleteSongMutation()

  const poke = React.useCallback(() => {
    brain.poke()
    winamp.pulse(1.6)
  }, [brain, winamp])

  const typing = React.useCallback(() => {
    brain.noteTyping()
    winamp.pulse(0.3)
  }, [brain, winamp])

  const applyDraft = React.useCallback(
    (next: Draft) => {
      setDraft(next)
      brain.setWordCount(countWords(`${next.style} ${next.lyrics}`))
    },
    [brain],
  )

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
      brain.poke()
      winamp.pulse(1.4)
    }
    lastStage.current = activeStage
  }, [activeStage, brain, winamp])

  React.useEffect(() => {
    if (pendingAutoPlay.current === null || activeSong === null) return
    if (activeSong.id !== pendingAutoPlay.current || activeSong.status !== "complete") return
    void audio.play().catch(() => {})
    pendingAutoPlay.current = null
  }, [activeSong, audio])

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

  return (
    <>
      <WinampCanvas engine={winamp} mode={mode} />
      <div className="tech-vignette" />
      <BrainEntity engine={brain} onPoke={poke} />

      <div className="fixed top-8 right-8 z-20 flex items-center gap-2.5 pointer-events-auto">
        {tripModes.map((trip) => (
          <button
            key={trip.mode}
            type="button"
            onClick={() => {
              setMode(trip.mode)
              brain.poke()
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
      </div>

      <main className="relative z-10 w-full h-full flex flex-col p-8 sm:p-14 md:p-16 pointer-events-none">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="min-h-full flex flex-col justify-center">
            <SongForm
              activeSong={activeSong}
              queueDepth={statusQuery.data?.queueDepth ?? null}
              style={draft.style}
              lyrics={draft.lyrics}
              onStyleChange={(value) => {
                applyDraft({ style: value, lyrics: draft.lyrics })
                typing()
              }}
              onLyricsChange={(value) => {
                applyDraft({ style: draft.style, lyrics: value })
                typing()
              }}
              onCreated={handleCreated}
            />
          </div>
        </div>

        <div className="shrink-0 pt-6">
          <SongPlayer song={activeSong} engine={audio} onPoke={poke} />
        </div>
      </main>

      <LoadSongDialog song={loadCandidate} onCancel={cancelLoad} onConfirm={confirmLoad} />

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
