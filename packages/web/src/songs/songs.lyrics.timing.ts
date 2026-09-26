export type VocalSpan = Readonly<{
  startSeconds: number
  endSeconds: number
}>

export type VocalTimeline = Readonly<{
  spans: readonly VocalSpan[]
  durationSeconds: number
}>

export type LyricCue = Readonly<{
  text: string
  section: string | null
  startSeconds: number
  endSeconds: number
}>

export type LyricCueInput = Readonly<{
  lyrics: string
  scoreAbc: string | null
  durationSeconds: number
  /** Per-line cues from a calibration that timed the sung lines. */
  cues?: readonly CueMatch[] | null
}>

export type CueMatch = Readonly<{
  text: string
  startSeconds: number
  endSeconds: number
}>

type WeightedLine = Readonly<{
  text: string
  section: string | null
  weight: number
  syllables: number
}>

type VoiceToken =
  | Readonly<{ kind: "note"; duration: number }>
  | Readonly<{ kind: "rest"; duration: number }>
  | Readonly<{ kind: "measureRest"; measures: number }>

const defaultNoteLength = 8
const defaultTempo = 120
const defaultBeatsPerMeasure = 4
const defaultBeatDivisor = 4
const breathGapSeconds = 0.35
const minimumCueSeconds = 0.05
const fallbackStartFraction = 0.06
const fallbackEndFraction = 0.94
const scaleFloor = 0.25
const scaleCeiling = 4
/** The overlay text settles in this many seconds, whatever the line length. */
export const lyricFadeInSeconds = 0.4
const fadeOutFraction = 0.28

const headerValue = (lines: readonly string[], field: string): string | null => {
  const prefix = `${field}:`
  const line = lines.find((candidate) => candidate.startsWith(prefix))
  return line === undefined ? null : line.slice(prefix.length).trim()
}

const parseNoteLength = (lines: readonly string[]): number => {
  const value = headerValue(lines, "L")
  if (value === null) return defaultNoteLength
  const denominator = Number.parseInt(value.split("/")[1] ?? "", 10)
  return Number.isFinite(denominator) && denominator > 0 ? denominator : defaultNoteLength
}

const parseTempo = (lines: readonly string[]): number => {
  const value = headerValue(lines, "Q")
  if (value === null) return defaultTempo
  const match = /=(\d+(?:\.\d+)?)/.exec(value)
  if (match === null) return defaultTempo
  const tempo = Number.parseFloat(match[1] ?? "")
  return Number.isFinite(tempo) && tempo > 0 ? tempo : defaultTempo
}

const parseMeter = (lines: readonly string[]): Readonly<{ beats: number; divisor: number }> => {
  const value = headerValue(lines, "M")
  if (value === null) return { beats: defaultBeatsPerMeasure, divisor: defaultBeatDivisor }
  const match = /^(\d+)\/(\d+)/.exec(value)
  if (match === null) return { beats: defaultBeatsPerMeasure, divisor: defaultBeatDivisor }
  const beats = Number.parseInt(match[1] ?? "", 10)
  const divisor = Number.parseInt(match[2] ?? "", 10)
  if (!Number.isFinite(beats) || !Number.isFinite(divisor) || beats <= 0 || divisor <= 0) {
    return { beats: defaultBeatsPerMeasure, divisor: defaultBeatDivisor }
  }
  return { beats, divisor }
}

const parseMultiplier = (text: string): number => {
  if (text === "") return 1
  if (text.includes("/")) {
    const [top, bottom] = text.split("/")
    const numerator = top === undefined || top === "" ? 1 : Number.parseFloat(top)
    const denominator = bottom === undefined || bottom === "" ? 2 : Number.parseFloat(bottom)
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 1
    return numerator / denominator
  }
  const value = Number.parseFloat(text)
  return Number.isFinite(value) && value > 0 ? value : 1
}

const voiceTokenPattern = /([A-Ga-gzZx])[,']*([\d/]*)/g

const toVoiceToken = (symbol: string, multiplier: number): VoiceToken => {
  if (symbol === "Z") return { kind: "measureRest", measures: multiplier }
  if (symbol === "z" || symbol === "x") return { kind: "rest", duration: multiplier }
  return { kind: "note", duration: multiplier }
}

/** Each note or rest letter, its octave marks, then its length multiplier. Everything else is skipped. */
const parseVoiceTokens = (body: string): readonly VoiceToken[] =>
  Array.from(
    body
      .replace(/"[^"]*"/g, "")
      .replace(/%.*$/, "")
      .matchAll(voiceTokenPattern),
    ([, symbol = "", multiplier = ""]) => toVoiceToken(symbol, parseMultiplier(multiplier)),
  )

const voiceHeaderPattern = /^V:\s*(\S+)\s*(.*)$/
const vocalNamePattern = /(?:name|snm)="Vocal/i

const isVoiceBody = (line: string): boolean =>
  line !== "" && !line.startsWith("%") && !/^[A-Za-z]:/.test(line)

type VoiceBlock = Readonly<{
  id: string
  vocal: boolean
  body: readonly string[]
}>

/** A `V:` header and the body lines up to the next one. Lines before the first header belong to no voice. */
const voiceBlocks = (lines: readonly string[]): readonly VoiceBlock[] => {
  const headers = lines.flatMap((line, index) => {
    const header = voiceHeaderPattern.exec(line)
    return header === null
      ? []
      : [{ index, id: header[1] ?? "", vocal: vocalNamePattern.test(header[2] ?? "") }]
  })
  return headers.map((header, position) => ({
    id: header.id,
    vocal: header.vocal,
    body: lines.slice(header.index + 1, headers[position + 1]?.index).filter(isVoiceBody),
  }))
}

type TimedToken = Readonly<{
  token: VoiceToken
  startSeconds: number
  endSeconds: number
}>

const mergeBreathGaps = (events: readonly VocalSpan[]): readonly VocalSpan[] =>
  events.reduce<readonly VocalSpan[]>((spans, event) => {
    const current = spans.at(-1)
    return current !== undefined && event.startSeconds - current.endSeconds <= breathGapSeconds
      ? [
          ...spans.slice(0, -1),
          {
            startSeconds: current.startSeconds,
            endSeconds: Math.max(current.endSeconds, event.endSeconds),
          },
        ]
      : [...spans, { startSeconds: event.startSeconds, endSeconds: event.endSeconds }]
  }, [])

export const parseYue2VocalTimeline = (scoreAbc: string): VocalTimeline | null => {
  if (scoreAbc.trim().length === 0) return null

  const lines = scoreAbc.split("\n").map((line) => line.trim())
  const noteLengthDenominator = parseNoteLength(lines)
  const tempo = parseTempo(lines)
  const meter = parseMeter(lines)

  const unitsPerQuarter = noteLengthDenominator / 4
  const secondsPerUnit = 60 / tempo / unitsPerQuarter
  const measureUnits = meter.beats * (4 / meter.divisor) * unitsPerQuarter

  const blocks = voiceBlocks(lines)
  const voiceIds = [...new Set(blocks.map((block) => block.id))]
  const taggedVocalIds = new Set(blocks.filter((block) => block.vocal).map((block) => block.id))
  const vocalIds =
    taggedVocalIds.size === 0 && voiceIds.includes("Vocal") ? new Set(["Vocal"]) : taggedVocalIds
  if (vocalIds.size === 0) return null

  const tokenSeconds = (token: VoiceToken): number =>
    token.kind === "measureRest"
      ? token.measures * measureUnits * secondsPerUnit
      : token.duration * secondsPerUnit

  const timeTokens = (tokens: readonly VoiceToken[]): readonly TimedToken[] =>
    tokens.reduce<readonly TimedToken[]>((timed, token) => {
      const startSeconds = timed.at(-1)?.endSeconds ?? 0
      return [...timed, { token, startSeconds, endSeconds: startSeconds + tokenSeconds(token) }]
    }, [])

  const voices = voiceIds.map((id) => ({
    id,
    timed: timeTokens(
      blocks
        .filter((block) => block.id === id)
        .flatMap((block) => block.body.flatMap(parseVoiceTokens)),
    ),
  }))

  const events = voices
    .filter((voice) => vocalIds.has(voice.id))
    .flatMap((voice) =>
      voice.timed
        .filter((timed) => timed.token.kind === "note")
        .map(({ startSeconds, endSeconds }) => ({ startSeconds, endSeconds })),
    )
  const songDuration = voices.reduce(
    (longest, voice) => Math.max(longest, voice.timed.at(-1)?.endSeconds ?? 0),
    0,
  )

  return { spans: mergeBreathGaps(events), durationSeconds: songDuration }
}

const maxLineWords = 12
const maxLineChars = 72

const syllableGroups = /[aeiouy]+/g

/** Rough English syllable count: vowel groups, word count when there are none. */
const countSyllables = (text: string): number => {
  const groups = text.toLowerCase().match(syllableGroups)
  if (groups !== null && groups.length > 0) return groups.length
  return Math.max(1, text.split(/\s+/).filter(Boolean).length)
}

const tagToken = /^\[([^\]]*)\]$/

const hasContent = (text: string): boolean => /[\p{L}\p{N}]/u.test(text)

const splitSegments = (text: string): readonly string[] =>
  text
    .split(/\n|\s+\/\s+/)
    .flatMap((segment) => segment.split(/(?<=[.!?;])\s+/))
    .flatMap((segment) => {
      const words = segment.trim().split(/\s+/).filter(Boolean).length
      return words > maxLineWords || segment.trim().length > maxLineChars
        ? segment.split(/,\s+/)
        : [segment]
    })
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && hasContent(segment))

const markdownHeader = /^#{1,6}\s+(.+?)\s*#*\s*$/

type LyricItem =
  | Readonly<{ kind: "section"; name: string | null }>
  | Readonly<{ kind: "text"; text: string }>

const sectionItem = (rawName: string | undefined): LyricItem => {
  const name = (rawName ?? "").trim()
  return { kind: "section", name: name === "" ? null : name }
}

/** Section changes and lyric lines, in the order they appear. */
const lyricItems = (lyrics: string): readonly LyricItem[] =>
  lyrics.split(/(\[[^\]]*\])/).flatMap((token): readonly LyricItem[] => {
    const tag = tagToken.exec(token)
    if (tag !== null) return [sectionItem(tag[1])]
    return token.split("\n").flatMap((rawLine): readonly LyricItem[] => {
      const header = markdownHeader.exec(rawLine.trim())
      if (header !== null) return [sectionItem(header[1])]
      return splitSegments(rawLine).map((text) => ({ kind: "text", text }))
    })
  })

type LyricScan = Readonly<{
  section: string | null
  lines: readonly WeightedLine[]
}>

/** Lines keep the `[Tag]` or `### Tag` that was active when they appeared, or null. */
const parseLyricLines = (lyrics: string): readonly WeightedLine[] =>
  lyricItems(lyrics).reduce<LyricScan>(
    (scan, item) =>
      item.kind === "section"
        ? { ...scan, section: item.name }
        : {
            ...scan,
            lines: [
              ...scan.lines,
              {
                text: item.text,
                section: scan.section,
                weight: Math.max(1, item.text.split(/\s+/).length),
                syllables: countSyllables(item.text),
              },
            ],
          },
    { section: null, lines: [] },
  ).lines

type CueLayout = Readonly<{
  cursor: number
  cues: readonly LyricCue[]
}>

/** Lays lines end to end across the window, each taking its share of `totalWeight`. */
const layOutCues = (
  lines: readonly WeightedLine[],
  window: VocalSpan,
  totalWeight: number,
): readonly LyricCue[] => {
  const windowDuration = window.endSeconds - window.startSeconds
  return lines.reduce<CueLayout>(
    ({ cursor, cues }, line) => {
      const end = Math.min(window.endSeconds, cursor + (windowDuration * line.weight) / totalWeight)
      return {
        cursor: end,
        cues:
          end - cursor > minimumCueSeconds
            ? [
                ...cues,
                { text: line.text, section: line.section, startSeconds: cursor, endSeconds: end },
              ]
            : cues,
      }
    },
    { cursor: window.startSeconds, cues: [] },
  ).cues
}

const totalLineWeight = (lines: readonly WeightedLine[]): number =>
  lines.reduce((total, line) => total + line.weight, 0)

const allocateToSpans = (
  lines: readonly WeightedLine[],
  spans: readonly VocalSpan[],
): readonly LyricCue[] => {
  const totalSinging = spans.reduce(
    (total, span) => total + (span.endSeconds - span.startSeconds),
    0,
  )
  if (totalSinging <= 0) return []

  const quotas = spans.map(
    (span) => (lines.length * (span.endSeconds - span.startSeconds)) / totalSinging,
  )
  const floors = quotas.map((quota) => Math.floor(quota))
  const leftover = lines.length - floors.reduce((total, count) => total + count, 0)
  const roundedUp = new Set(
    quotas
      .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
      .slice(0, Math.max(0, leftover))
      .map(({ index }) => index),
  )
  const counts = floors.map((floor, index) => floor + (roundedUp.has(index) ? 1 : 0))
  const offsets = counts.reduce<readonly number[]>(
    (starts, count) => [...starts, (starts.at(-1) ?? 0) + count],
    [0],
  )

  return spans.flatMap((span, spanIndex) => {
    const start = offsets[spanIndex] ?? 0
    const group = lines.slice(start, start + (counts[spanIndex] ?? 0))
    return group.length === 0 ? [] : layOutCues(group, span, totalLineWeight(group))
  })
}

const allocateToWindow = (
  lines: readonly WeightedLine[],
  window: VocalSpan,
): readonly LyricCue[] => {
  const totalWeight = totalLineWeight(lines)
  if (totalWeight <= 0 || window.endSeconds - window.startSeconds <= 0) return []
  return layOutCues(lines, window, totalWeight)
}

const normalizeCueText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/** Written line text to section, so a cue that matches a line keeps its section. */
const cueSections = (lines: readonly WeightedLine[]): ReadonlyMap<string, string | null> => {
  const sections = new Map<string, string | null>()
  for (const line of lines) {
    const key = normalizeCueText(line.text)
    if (key !== "" && !sections.has(key)) sections.set(key, line.section)
  }
  return sections
}

/**
 * Cues are the display timeline: whatever text the calibration carries is what
 * shows, timed as calibrated. Written lines are only used to recover sections.
 */
const fromCues = (
  cues: readonly CueMatch[],
  lines: readonly WeightedLine[],
): readonly LyricCue[] => {
  const sections = cueSections(lines)
  return cues.reduce<readonly LyricCue[]>((result, cue) => {
    const text = cue.text.trim()
    if (text === "") return result
    const start = Math.max(cue.startSeconds, result.at(-1)?.endSeconds ?? 0)
    const end = Math.max(cue.endSeconds, start + minimumCueSeconds)
    return [
      ...result,
      {
        text,
        section: sections.get(normalizeCueText(text)) ?? null,
        startSeconds: start,
        endSeconds: end,
      },
    ]
  }, [])
}

export const buildLyricCues = (input: LyricCueInput): readonly LyricCue[] => {
  if (!(input.durationSeconds > 0)) return []

  const lines = parseLyricLines(input.lyrics)
  const calibratedCues = input.cues ?? []
  if (calibratedCues.length > 0) {
    const cues = fromCues(calibratedCues, lines)
    if (cues.length > 0) return cues
  }

  if (lines.length === 0) return []

  if (input.scoreAbc !== null) {
    const timeline = parseYue2VocalTimeline(input.scoreAbc)
    if (timeline !== null && timeline.spans.length > 0 && timeline.durationSeconds > 0) {
      const scale = Math.min(
        scaleCeiling,
        Math.max(scaleFloor, input.durationSeconds / timeline.durationSeconds),
      )
      const spans = timeline.spans.map((span) => ({
        startSeconds: span.startSeconds * scale,
        endSeconds: Math.min(span.endSeconds * scale, input.durationSeconds),
      }))
      const cues = allocateToSpans(lines, spans)
      if (cues.length > 0) return cues
    }
  }

  return allocateToWindow(lines, {
    startSeconds: input.durationSeconds * fallbackStartFraction,
    endSeconds: input.durationSeconds * fallbackEndFraction,
  })
}

/** The last cue in the leading run that has started by `seconds`, or null. */
export const cueIndexAt = (cues: readonly LyricCue[], seconds: number): number | null => {
  const firstUnstarted = cues.findIndex((cue) => !(cue.startSeconds <= seconds))
  const started = firstUnstarted === -1 ? cues.length : firstUnstarted
  return started === 0 ? null : started - 1
}

export const lyricEnvelope = (progress: number, fadeInFraction: number): number => {
  const clamped = Math.min(1, Math.max(0, progress))
  const fadeIn = Math.min(1, clamped / fadeInFraction)
  const fadeOut = Math.min(1, (1 - clamped) / fadeOutFraction)
  return Math.min(fadeIn, fadeOut)
}
