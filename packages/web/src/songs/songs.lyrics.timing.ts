export type VocalSpan = Readonly<{ startSeconds: number; endSeconds: number }>

export type VocalTimeline = Readonly<{
  spans: readonly VocalSpan[]
  durationSeconds: number
}>

export type LyricCue = Readonly<{
  text: string
  startSeconds: number
  endSeconds: number
}>

export type LyricCueInput = Readonly<{
  lyrics: string
  scoreAbc: string | null
  durationSeconds: number
}>

type WeightedLine = Readonly<{ text: string; weight: number }>

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
const fadeInFraction = 0.16
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

const splitLyricSegments = (lyrics: string): readonly string[] =>
  lyrics
    .replace(/\[[^\]]*\]/g, "\n")
    .split(/\n|\s+\/\s+/)
    .flatMap((segment) => segment.split(/(?<=[.!?;])\s+/))
    .flatMap((segment) => {
      const words = segment.trim().split(/\s+/).filter(Boolean).length
      return words > maxLineWords || segment.trim().length > maxLineChars
        ? segment.split(/,\s+/)
        : [segment]
    })
    .map((segment) => segment.trim())
    .filter((text) => text.length > 0)

const parseLyricLines = (lyrics: string): readonly WeightedLine[] =>
  splitLyricSegments(lyrics).map((text) => ({
    text,
    weight: Math.max(1, text.split(/\s+/).length),
  }))

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
  const counts = quotas.map((quota) => Math.floor(quota))
  const leftover = lines.length - counts.reduce((total, count) => total + count, 0)
  const byRemainder = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
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
        cues.push({ text: line.text, startSeconds: cursor, endSeconds: end })
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
      cues.push({ text: line.text, startSeconds: cursor, endSeconds: end })
    }
    cursor = end
  }
  return cues
}

export const buildLyricCues = (input: LyricCueInput): readonly LyricCue[] => {
  const lines = parseLyricLines(input.lyrics)
  if (lines.length === 0 || !(input.durationSeconds > 0)) return []

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

export const lyricEnvelope = (progress: number): number => {
  const clamped = Math.min(1, Math.max(0, progress))
  const fadeIn = Math.min(1, clamped / fadeInFraction)
  const fadeOut = Math.min(1, (1 - clamped) / fadeOutFraction)
  return Math.min(fadeIn, fadeOut)
}
