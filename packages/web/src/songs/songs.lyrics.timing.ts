export type VocalSpan = Readonly<{
  startSeconds: number
  endSeconds: number
  /** Notes sung inside the span, used to match written lines to real notes. */
  noteCount?: number
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
  vocalSpans?: readonly VocalSpan[] | null
  /** Per-line cues from a calibration that timed the lines directly. */
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

const parseVoiceTokens = (body: string): readonly VoiceToken[] => {
  const tokens: VoiceToken[] = []
  const text = body.replace(/"[^"]*"/g, "").replace(/%.*$/, "")
  let index = 0

  while (index < text.length) {
    const char = text[index] ?? ""
    if (char === "|" || char === " " || char === "\t") {
      index += 1
      continue
    }
    if ("!()[]<>-_^=".includes(char)) {
      index += 1
      continue
    }
    if (!/[A-Ga-gzZx]/.test(char)) {
      index += 1
      continue
    }

    const symbol = char
    index += 1
    while (index < text.length && /[,']/.test(text[index] ?? "")) index += 1

    let multiplierText = ""
    while (index < text.length && /[\d/]/.test(text[index] ?? "")) {
      multiplierText += text[index]
      index += 1
    }
    const multiplier = parseMultiplier(multiplierText)

    if (symbol === "Z") {
      tokens.push({ kind: "measureRest", measures: multiplier })
    } else if (symbol === "z" || symbol === "x") {
      tokens.push({ kind: "rest", duration: multiplier })
    } else {
      tokens.push({ kind: "note", duration: multiplier })
    }
  }

  return tokens
}

export const parseYue2VocalTimeline = (scoreAbc: string): VocalTimeline | null => {
  if (scoreAbc.trim().length === 0) return null

  const lines = scoreAbc.split("\n").map((line) => line.trim())
  const noteLengthDenominator = parseNoteLength(lines)
  const tempo = parseTempo(lines)
  const meter = parseMeter(lines)

  const unitsPerQuarter = noteLengthDenominator / 4
  const secondsPerUnit = 60 / tempo / unitsPerQuarter
  const measureUnits = meter.beats * (4 / meter.divisor) * unitsPerQuarter

  const voices = new Map<string, VoiceToken[]>()
  const vocalIds = new Set<string>()
  const declaredVoices: string[] = []
  let currentVoice: string | null = null

  for (const line of lines) {
    const voiceHeader = /^V:\s*(\S+)\s*(.*)$/.exec(line)
    if (voiceHeader !== null) {
      currentVoice = voiceHeader[1] ?? null
      if (currentVoice !== null) {
        if (!voices.has(currentVoice)) {
          voices.set(currentVoice, [])
          declaredVoices.push(currentVoice)
        }
        if (/(?:name|snm)="Vocal/i.test(voiceHeader[2] ?? "")) vocalIds.add(currentVoice)
      }
      continue
    }
    if (currentVoice === null) continue
    if (line === "" || line.startsWith("%") || /^[A-Za-z]:/.test(line)) continue
    voices.get(currentVoice)?.push(...parseVoiceTokens(line))
  }

  if (vocalIds.size === 0 && voices.has("Vocal")) vocalIds.add("Vocal")
  if (vocalIds.size === 0) return null

  const events: { startSeconds: number; endSeconds: number }[] = []
  let songDuration = 0

  for (const [voiceId, tokens] of voices) {
    let time = 0
    for (const token of tokens) {
      if (token.kind === "note") {
        const duration = token.duration * secondsPerUnit
        if (vocalIds.has(voiceId)) events.push({ startSeconds: time, endSeconds: time + duration })
        time += duration
      } else if (token.kind === "rest") {
        time += token.duration * secondsPerUnit
      } else {
        time += token.measures * measureUnits * secondsPerUnit
      }
    }
    songDuration = Math.max(songDuration, time)
  }

  const spans: { startSeconds: number; endSeconds: number }[] = []
  for (const event of events) {
    const current = spans.at(-1)
    if (current !== undefined && event.startSeconds - current.endSeconds <= breathGapSeconds) {
      current.endSeconds = Math.max(current.endSeconds, event.endSeconds)
    } else {
      spans.push({ startSeconds: event.startSeconds, endSeconds: event.endSeconds })
    }
  }

  return { spans, durationSeconds: songDuration }
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

/** Lines keep the `[Tag]` or `### Tag` that was active when they appeared, or null. */
const parseLyricLines = (lyrics: string): readonly WeightedLine[] => {
  const lines: WeightedLine[] = []
  let section: string | null = null
  for (const token of lyrics.split(/(\[[^\]]*\])/)) {
    const tag = tagToken.exec(token)
    if (tag !== null) {
      const name = (tag[1] ?? "").trim()
      section = name === "" ? null : name
      continue
    }
    for (const rawLine of token.split("\n")) {
      const header = markdownHeader.exec(rawLine.trim())
      if (header !== null) {
        const name = (header[1] ?? "").trim()
        section = name === "" ? null : name
        continue
      }
      for (const text of splitSegments(rawLine)) {
        lines.push({
          text,
          section,
          weight: Math.max(1, text.split(/\s+/).length),
          syllables: countSyllables(text),
        })
      }
    }
  }
  return lines
}

const allocateToSpans = (
  lines: readonly WeightedLine[],
  spans: readonly VocalSpan[],
  /** Calibrated cues anchor the first line to the first detected phrase. */
  anchorFirstSpan = false,
): readonly LyricCue[] => {
  const totalSinging = spans.reduce(
    (total, span) => total + (span.endSeconds - span.startSeconds),
    0,
  )
  if (totalSinging <= 0) return []

  const quotas = spans.map(
    (span) => (lines.length * (span.endSeconds - span.startSeconds)) / totalSinging,
  )
  const counts = quotas.map((quota) => Math.floor(quota))
  let leftover = lines.length - counts.reduce((total, count) => total + count, 0)
  const firstSpan = spans[0]
  const anchored =
    anchorFirstSpan &&
    lines.length > 0 &&
    (counts[0] ?? 0) === 0 &&
    firstSpan !== undefined &&
    firstSpan.endSeconds > firstSpan.startSeconds
  if (anchored) {
    counts[0] = 1
    leftover -= 1
  }
  const byRemainder = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .filter((entry) => !anchored || entry.index !== 0)
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
  for (let extra = 0; extra < leftover; extra += 1) {
    const target = byRemainder[extra]
    if (target !== undefined) counts[target.index] = (counts[target.index] ?? 0) + 1
  }

  const cues: LyricCue[] = []
  let lineIndex = 0
  spans.forEach((span, spanIndex) => {
    const count = counts[spanIndex] ?? 0
    if (count <= 0) return
    const group = lines.slice(lineIndex, lineIndex + count)
    lineIndex += group.length
    if (group.length === 0) return

    const spanDuration = span.endSeconds - span.startSeconds
    const groupWeight = group.reduce((total, line) => total + line.weight, 0)
    let cursor = span.startSeconds
    for (const line of group) {
      const end = Math.min(span.endSeconds, cursor + (spanDuration * line.weight) / groupWeight)
      if (end - cursor > minimumCueSeconds) {
        cues.push({ text: line.text, section: line.section, startSeconds: cursor, endSeconds: end })
      }
      cursor = end
    }
  })

  return cues
}

const allocateToWindow = (
  lines: readonly WeightedLine[],
  window: VocalSpan,
): readonly LyricCue[] => {
  const totalWeight = lines.reduce((total, line) => total + line.weight, 0)
  const windowDuration = window.endSeconds - window.startSeconds
  if (totalWeight <= 0 || windowDuration <= 0) return []

  const cues: LyricCue[] = []
  let cursor = window.startSeconds
  for (const line of lines) {
    const end = Math.min(window.endSeconds, cursor + (windowDuration * line.weight) / totalWeight)
    if (end - cursor > minimumCueSeconds) {
      cues.push({ text: line.text, section: line.section, startSeconds: cursor, endSeconds: end })
    }
    cursor = end
  }
  return cues
}

/**
 * Matches written lines to whole runs of detected phrases, using how many notes
 * were sung in each phrase. A line's cue runs from its first phrase onset to its
 * last phrase offset, so held notes stretch the line.
 */
const allocateByNoteCount = (
  lines: readonly WeightedLine[],
  spans: readonly VocalSpan[],
): readonly LyricCue[] => {
  const lineCount = lines.length
  const spanCount = spans.length
  if (lineCount === 0 || spanCount === 0 || lineCount > spanCount) return []

  const notes = spans.map((span) => span.noteCount ?? 0)
  if (notes.some((count) => count <= 0)) return []
  const totalNotes = notes.reduce((total, count) => total + count, 0)
  const totalSyllables = lines.reduce((total, line) => total + line.syllables, 0)
  if (totalNotes <= 0 || totalSyllables <= 0) return []

  const prefix = [0]
  for (const count of notes) prefix.push((prefix.at(-1) ?? 0) + count)
  const expected = lines.map((line) => (line.syllables * totalNotes) / totalSyllables)

  const infinity = Number.POSITIVE_INFINITY
  const cost: number[][] = Array.from({ length: lineCount + 1 }, () =>
    Array.from({ length: spanCount + 1 }, () => infinity),
  )
  const previous: number[][] = Array.from({ length: lineCount + 1 }, () =>
    Array.from({ length: spanCount + 1 }, () => -1),
  )
  const startRow = cost[0]
  if (startRow !== undefined) startRow[0] = 0

  for (let line = 1; line <= lineCount; line += 1) {
    const row = cost[line]
    const beforeRow = cost[line - 1]
    if (row === undefined || beforeRow === undefined) continue
    for (let end = line; end <= spanCount; end += 1) {
      for (let start = line - 1; start < end; start += 1) {
        const before = beforeRow[start] ?? infinity
        if (!Number.isFinite(before)) continue
        const assigned = (prefix[end] ?? 0) - (prefix[start] ?? 0)
        const error = (assigned - (expected[line - 1] ?? 0)) ** 2
        if (before + error < (row[end] ?? infinity)) {
          row[end] = before + error
          const previousRow = previous[line]
          if (previousRow !== undefined) previousRow[end] = start
        }
      }
    }
  }

  if (!Number.isFinite(cost[lineCount]?.[spanCount] ?? infinity)) return []

  const bounds: number[] = []
  let cursor = spanCount
  for (let line = lineCount; line > 0; line -= 1) {
    const start = previous[line]?.[cursor] ?? -1
    if (start < 0) return []
    bounds.unshift(start)
    cursor = start
  }
  bounds.push(spanCount)

  const cues: LyricCue[] = []
  for (let index = 0; index < lineCount; index += 1) {
    const line = lines[index]
    const first = spans[bounds[index] ?? 0]
    const last = spans[(bounds[index + 1] ?? spanCount) - 1]
    if (line === undefined || first === undefined || last === undefined) continue
    cues.push({
      text: line.text,
      section: line.section,
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
    })
  }
  return cues
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
  const result: LyricCue[] = []
  let previousEnd = 0
  for (const cue of cues) {
    const text = cue.text.trim()
    if (text === "") continue
    const start = Math.max(cue.startSeconds, previousEnd)
    const end = Math.max(cue.endSeconds, start + minimumCueSeconds)
    result.push({
      text,
      section: sections.get(normalizeCueText(text)) ?? null,
      startSeconds: start,
      endSeconds: end,
    })
    previousEnd = end
  }
  return result
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

  const vocalSpans = input.vocalSpans ?? []
  if (vocalSpans.length > 0) {
    const byNoteCount = allocateByNoteCount(lines, vocalSpans)
    if (byNoteCount.length > 0) return byNoteCount

    const cues = allocateToSpans(lines, vocalSpans, true)
    if (cues.length > 0) return cues
  }

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

export const cueIndexAt = (cues: readonly LyricCue[], seconds: number): number | null => {
  let found: number | null = null
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]
    if (cue === undefined) continue
    if (cue.startSeconds <= seconds) {
      found = index
    } else {
      break
    }
  }
  return found
}

export const lyricEnvelope = (progress: number, fadeInFraction: number): number => {
  const clamped = Math.min(1, Math.max(0, progress))
  const fadeIn = Math.min(1, clamped / fadeInFraction)
  const fadeOut = Math.min(1, (1 - clamped) / fadeOutFraction)
  return Math.min(fadeIn, fadeOut)
}
