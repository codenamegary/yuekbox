const fence = /^\s*```[a-zA-Z0-9]*\n([\s\S]*?)\n?```\s*$/

/** Strip markdown fences and stray wrapping quotes that models love to add. */
export const cleanAgentText = (raw: string): string => {
  let text = raw.trim()
  const fenced = fence.exec(text)
  if (fenced !== null && fenced[1] !== undefined) {
    text = fenced[1].trim()
  }
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length > 1) ||
    (text.startsWith("'") && text.endsWith("'") && text.length > 1)
  ) {
    text = text.slice(1, -1).trim()
  }
  return text.trim()
}

const maxStyleWords = 140

export type RandomSongDraft = Readonly<{ style: string; lyrics: string }>

export type StyleNudge = Readonly<{
  genre: string
  voice: string
  production: string
  register: string
}>

const genreHints: readonly string[] = [
  // pop & rock
  "sun-drenched indie pop, jangly guitars, hand claps",
  "1999 TRL-era pop: Max Martin chords and a key change",
  "pop-punk, snotty and fast, floor-tom chorus",
  "arena rock with a stadium guitar solo",
  "garage rock, one mic in a basement",
  "shoegaze wall of guitars, buried vocal",
  "post-punk, cold and angular, dub bass",
  "prog rock in 7/8, organ and fuzz",
  "hard rock riffage, 70s swagger",
  "synth-pop, gated snares and neon",
  // EDM & club
  "big-room EDM festival anthem, supersaw drop at 128 bpm",
  "melodic house, piano stabs, sunrise vocal",
  "acid techno, 303s and a relentless kick",
  "trance, arpeggios and a 32-bar breakdown",
  "dubstep, wobble bass and half-time drums",
  "drum and bass, 174 bpm, liquid pads",
  "hardstyle, distorted kicks, euphoric melody",
  "UK garage, shuffled 2-step, pitched vocal chops",
  "hyperpop, glitched and sugar-rushed",
  // hip-hop & rap
  "boom-bap hip-hop, dusty sample, hard snare",
  "trap, 808 slides, triplet hi-hats",
  "drill, sliding bass, menacing and cold",
  "90s East Coast rap, scratched hook",
  "lo-fi rap over a jazzy loop",
  "grime, 140 bpm, icy synths",
  "comedy rap: punchlines on the beat, absurd boasts",
  // R&B, soul, funk
  "90s R&B, finger snaps, layered harmonies",
  "neo-soul, Rhodes, lazy pocket",
  "Motown-style soul, tambourine and call-and-response",
  "funk, slap bass, Clavinet, party instructions",
  "disco, four-on-the-floor, lush strings",
  // country, folk, blues
  "outlaw country, telecaster twang, train beat",
  "folk ballad, fingerpicked, close harmony",
  "bluegrass, breakneck picking, high lonesome",
  "Delta blues, slide guitar, stomp box",
  // jazz & classical
  "bebop jazz trio, walking bass, brushed drums",
  "big-band swing, brass punches",
  "baroque chamber pop, harpsichord and strings",
  "cinematic orchestral, slow build, wordless choir",
  // latin & global
  "reggaeton, dembow riddim, warm 808",
  "cumbia, accordion and guiro",
  "salsa dura, piano montuno, horn section",
  "bossa nova, nylon guitar, whispered close harmony",
  "Afrobeats, log drum, sunny guitar",
  "amapiano, log drums, deep piano chords",
  "K-pop, genre-hopping sections, huge chorus",
  "Bollywood playback, strings and tabla",
  "Ethiopian jazz, pentatonic horns",
  "sea shanty, many voices, work-song rhythm",
  // reggae & caribbean
  "roots reggae, one-drop, skank guitar",
  "dancehall, patois delivery, riddim built for a soundsystem",
  // comedy & novelty
  "comedy song: musical parody with punchlines landing on the beat",
  "novelty dance track with absurd instructions",
  "spoken-word comedy over a smooth jazz bed",
  "Weird Al-style accordion polka parody",
  "children's sing-along that is secretly for adults",
  // beyond
  "ambient, beatless, slow-motion pads",
  "video game chiptune, 8-bit arpeggios",
  "marching band, snare cadence and brass",
  // mashups
  "two-genre mashup: gospel meets industrial",
  "two-genre mashup: bossa nova meets shoegaze",
  "two-genre mashup: bluegrass meets techno",
  "two-genre mashup: doo-wop meets black metal",
  "two-genre mashup: spaghetti western meets synthwave",
  "two-genre mashup: baroque pop meets trap",
  "two-genre mashup: zydeco meets drum and bass",
]

const voiceHints: readonly string[] = [
  "male baritone, smoky late-night croon",
  "female alto with worn-in soul grit, belting",
  "two voices trading lines: male tenor and female alto duet",
  "androgynous countertenor, high and strange",
  "deep male basso, slow and ceremonial",
  "female mezzo, clear and bell-like, almost childlike",
  "gravelly male blues shout, half-spoken",
  "mixed choir, many voices, wordless at the edges",
  "falsetto male soul lead, tender and stretched",
  "raspy female punk delivery, sneering and close",
  "half-spoken male drawl, conversational, almost bored",
  "close-mic whisper, gender deliberately ambiguous",
  "elder storyteller voice, cracked and warm",
  "a lead answered by a crowd of voices",
]

const productionHints: readonly string[] = [
  "1974 analog: dry drums, tape wobble, hard panning",
  "cavernous modern reverb, everything huge and slow",
  "intimate bedroom recording, audible room, close breathing",
  "lo-fi 4-track hiss, warm and slightly broken",
  "widescreen cinematic strings over a heavy low end",
  "club-forward, sidechained, loud and clean",
  "live basement take, one room mic, bleed and all",
  "icy digital sheen, glassy highs and sub bass",
  "dusty sampler and vinyl crackle over live drums",
  "brass-forward and dry, like a marching band in a stairwell",
]

const registerHints: readonly string[] = [
  "radio-clean throughout — no profanity, no slurs",
  "conversational and slangy, like texting a friend",
  "street slang, regional dialect, code-switching",
  "explicit when the song earns it — profanity, grit, adult themes — never gratuitous",
  "poetic and literary, no slang, no profanity",
  "plain-spoken storytelling, everyday words",
  "playful wordplay and double entendre, flirty but not explicit",
  "raunchy comedy register — innuendo and punchlines, no slurs",
  "arch and theatrical, old-world vocabulary",
]

const pick = <T>(items: readonly T[], random: () => number): T => {
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))
  return items[index] as T
}

/** A random production nudge so consecutive enhances never converge on the same take. */
export const pickStyleNudge = (random: () => number = Math.random): StyleNudge => ({
  genre: pick(genreHints, random),
  voice: pick(voiceHints, random),
  production: pick(productionHints, random),
  register: pick(registerHints, random),
})

const styleBriefDimensions = `- Genre: one lane, or a deliberate mashup of two (name both).
- Voice: a specific singer profile — sex (male / female / duet / choir), range, timbre,
  delivery, era. State it plainly and vary it: never reach for the same breathy
  female lead by default.
- Instrumentation: 3 to 6 named instruments or sound sources.
- Mood: the emotional weather in a few words.
- Tempo: a BPM or an unmistakable feel.
- Harmony: name a key plus one or two chord colors or a short progression.
- Production: era, space, texture.`

const wordsRule =
  "Word choice: follow the register above — slang, dialect, and profanity only where it " +
  "asks for them; slurs are never allowed."

const lyricsLineRule =
  "Every sung line goes on its own line, ending in a single newline. Section tags like " +
  "[Verse], [Chorus], [Bridge], [Outro] each start a new line and appear alone — never " +
  "append a tag to the end of a sung line. Never pack a verse into one paragraph."

const nudgeLine = (nudge: StyleNudge, conflictLine: string): string =>
  `For this take, lean toward: ${nudge.genre} · ${nudge.voice} · ${nudge.production} · ` +
  `${nudge.register}.\n${conflictLine}`

export const buildStyleEnhancePrompt = (input: {
  readonly style: string
  readonly lyrics?: string
  readonly nudge: StyleNudge
}): string => {
  const lyrics = input.lyrics?.trim() ?? ""
  const lyricsContext =
    lyrics === ""
      ? ""
      : `\nThe lyrics, for voice casting and mood (do not repeat or rewrite them):\n${lyrics.slice(0, 600)}\n`
  return `Rewrite the STYLE below into one vivid production brief for a text-to-song model (YuE2).
Keep the user's musical intent. Where the STYLE is silent or vague, decide for me.
Make every dimension explicit — never leave the voice implied or the genre generic:

${styleBriefDimensions}

${nudgeLine(input.nudge, "If that fights the STYLE, the STYLE wins.")}
${wordsRule}
Keep it under ${maxStyleWords} words. Output ONLY the brief — no preamble, no quotes, no commentary.
${lyricsContext}
STYLE:
${input.style}`
}

export const buildLyricsEnhancePrompt = (input: {
  readonly style: string
  readonly lyrics: string
}): string => {
  const styleContext =
    input.style.trim().length > 0
      ? `The song's style is: ${input.style.trim()}\n`
      : "No style is given; infer one from the lyrics themselves.\n"
  const task =
    input.lyrics.trim().length === 0
      ? "Write brand new original song lyrics that fit the style."
      : `Rework and extend the LYRICS below. Keep their theme, voice, and language;
improve flow and imagery, complete partial sections, and keep the [Verse] / [Chorus] /
[Bridge] section structure YuE2 expects. Return the full lyric sheet, not a diff.`
  return `You are writing for a text-to-song model (YuE2).
${task}
${styleContext}
Lyrics must use explicit section tags like [Verse], [Chorus], [Bridge], [Outro].
${lyricsLineRule}
${wordsRule}
Keep the whole song between 150 and 400 words. Output ONLY the lyrics.

LYRICS:
${input.lyrics}`
}

export const buildRandomSongPrompt = (input: {
  readonly nudge: StyleNudge
}): string => `Invent one brand new song from scratch, then brief it like a producer.
Be adventurous; commit fully to the direction you pick.

${nudgeLine(input.nudge, "If it fights where the song is heading, the song wins.")}
${wordsRule}

Reply with exactly two sections and nothing else. No JSON, no markdown fences, no commentary.

STYLE:
One vivid paragraph (under ${maxStyleWords} words) that states: genre (one lane, or a
deliberate two-genre mashup — name both), the singer profile (sex, range, timbre, delivery —
state it plainly and vary it; never default to the same breathy female lead), 3 to 6 named
instruments, mood, tempo, a key plus one or two chord colors or a short progression, and the
production era and texture.

LYRICS:
[Verse]
<one sung line>
<one sung line>

Rules for the lyrics, all mandatory:
- ${lyricsLineRule}
- 150 to 400 words, written for that singer's voice in that register.`

const jsonCandidate = (raw: string): string => {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return ""
  return raw.slice(start, end + 1)
}

const fallbackDraftFromMarkers = (raw: string): RandomSongDraft | null => {
  const styleMatch = /style\s*[:]\s*([\s\S]*?)(?:lyrics\s*[:]|$)/i.exec(raw)
  const lyricsMatch = /lyrics\s*[:]\s*([\s\S]*)/i.exec(raw)
  const style = styleMatch?.[1]?.trim() ?? ""
  const lyrics = lyricsMatch?.[1]?.trim() ?? ""
  if (style === "" || lyrics === "") return null
  return { style, lyrics }
}

/** Parse the model's reply into a song draft; tolerates fences and chatter. */
export const parseRandomSong = (raw: string): RandomSongDraft | null => {
  const candidate = jsonCandidate(raw)
  if (candidate !== "") {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "style" in parsed &&
        "lyrics" in parsed &&
        typeof parsed.style === "string" &&
        typeof parsed.lyrics === "string"
      ) {
        const style = cleanAgentText(parsed.style)
        const lyrics = parsed.lyrics.trim()
        if (style !== "" && lyrics !== "") return { style, lyrics }
      }
    } catch {
      // fall through to the marker parser
    }
  }
  return fallbackDraftFromMarkers(raw)
}

/** The model must return usable text; fences and quotes are tolerated. */
export const parseEnhanceText = (raw: string): string | null => {
  const text = cleanAgentText(raw)
  return text === "" ? null : text
}
