const fence = /^\s*```[a-zA-Z0-9]*\n([\s\S]*?)\n?```\s*$/

/** Strip markdown fences and stray wrapping quotes that models love to add. */
export const cleanAgentText = (raw: string): string => {
  const trimmed = raw.trim()
  const fenced = fence.exec(trimmed)
  const unfenced = fenced !== null && fenced[1] !== undefined ? fenced[1].trim() : trimmed
  const quoted =
    (unfenced.startsWith('"') && unfenced.endsWith('"') && unfenced.length > 1) ||
    (unfenced.startsWith("'") && unfenced.endsWith("'") && unfenced.length > 1)
  const unquoted = quoted ? unfenced.slice(1, -1).trim() : unfenced
  return unquoted.trim()
}

export const maxStyleWords = 140
const minLyricsWords = 150
const maxLyricsWords = 400

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

/** Random order per call so consecutive takes never reach for the same safe pick. */
const shuffled = <T>(items: readonly T[], random: () => number): readonly T[] =>
  items
    .map((item) => ({ item, key: random() }))
    .sort((left, right) => left.key - right.key)
    .map((entry) => entry.item)

const paletteLine = (label: string, hints: readonly string[], random: () => number): string =>
  `${label}: ${shuffled(hints, random).join(" · ")}`

const styleBriefDimensions = `- Language: the language the words are sung in, listed first (for example English,
  Mandarin, Cantonese, Japanese). Infer it from the lyrics when they are supplied;
  otherwise keep what the STYLE implies and default to English.
- Genre: one lane, or a deliberate mashup of two (name both).
- Voice: a specific singer profile — sex (male / female / duet / choir), range, timbre,
  delivery, era. State it plainly and vary it: never reach for the same breathy
  female lead by default.
- Instrumentation: 3 to 6 named instruments or sound sources.
- Mood: the emotional weather in a few words.
- Tempo: a BPM or an unmistakable feel.
- Harmony: a key or a harmonic color only when it helps — the planner writes the chords.
- Production: era, space, texture.`

const wordsRule =
  "Word choice: slang, dialect, and profanity only where the song calls for them; " +
  "slurs are never allowed."

const styleStackRule =
  "Format: one comma-separated stack of short descriptors, strongest first. " +
  "No labels, no full sentences, no square brackets of any kind. Aim for 25 to 50 words. " +
  'May add "no <instrument>" to drop one instrument — nothing else negative.'

const plainTextRule =
  "Plain text only: no markdown of any kind (no bold, italics, headings, bullets, " +
  "numbered lists, backticks, code fences, links), no semicolons, no em dashes. " +
  "Commas, periods, question marks, exclamation points, and apostrophes are fine."

const lyricsLineRule =
  "Every sung line goes on its own line, ending in a single newline. Section tags like " +
  "[Verse], [Chorus], [Bridge], [Outro] each start a new line and appear alone — never " +
  "append a tag to the end of a sung line. Never pack a verse into one paragraph."

const songStructures = `- [Verse] → [Chorus] → [Verse] → [Chorus] → [Bridge] → [Outro] — the standard
- [Verse] → [Chorus] → [Verse] → [Chorus] → [Outro] — short, no bridge
- [Verse] → [Pre-Chorus] → [Chorus] → [Verse] → [Pre-Chorus] → [Chorus] → [Bridge] → [Chorus] — modern pop
- [Verse] → [Verse] → [Chorus] → [Verse] → [Chorus] → [Outro] — rap and storytelling
- [Intro] → [Verse] → [Chorus] → [Verse] → [Chorus] → [Bridge] → [Chorus] → [Outro] — full pop
- [Verse] → [Chorus] → [Verse] → [Chorus] → [Bridge] → [Verse] → [Chorus] → [Outro] — extended
- [Verse] → [Verse] → [Bridge] → [Verse] → [Outro] — AABA standard`

export const buildStyleEnhancePrompt = (input: {
  readonly style: string
  readonly lyrics?: string
}): string => {
  const lyrics = input.lyrics?.trim() ?? ""
  const lyricsContext =
    lyrics === ""
      ? ""
      : `\nThe lyrics, for voice casting, language, and mood (do not repeat or rewrite them):\n${lyrics.slice(0, 600)}\n`
  return `Rewrite the STYLE below into one production brief for a text-to-song model (YuE2).
Keep the user's musical intent. Where the STYLE is silent or vague, decide for me.
Make every dimension explicit — never leave the voice implied or the genre generic:

${styleBriefDimensions}

${styleStackRule}
${plainTextRule}
${wordsRule}
Keep it under ${maxStyleWords} words. Output ONLY the brief — no preamble, no quotes, no commentary.
${lyricsContext}
STYLE:
${input.style}`
}

/** Lyrics only — the style never enters the lyric prompt, so it cannot be sung back. */
export const buildLyricsEnhancePrompt = (input: { readonly lyrics: string }): string => {
  const task =
    input.lyrics.trim().length === 0
      ? `Write brand new original song lyrics.
Pick exactly one of these common song structures and follow it from start to finish:
${songStructures}`
      : `Rework and extend the LYRICS below. Keep their theme, voice, and language;
improve flow and imagery, complete partial sections, and keep the [Verse] / [Chorus] /
[Bridge] section structure YuE2 expects. Return the full lyric sheet, not a diff.
If the LYRICS have no clear structure, pick exactly one of these and follow it:
${songStructures}`
  return `You are writing for a text-to-song model (YuE2).
${task}
Lyrics must use explicit section tags like [Verse], [Chorus], [Bridge], [Outro].
${lyricsLineRule}
${plainTextRule}
${wordsRule}
Keep the whole song between 150 and 400 words. Output ONLY the lyrics.

LYRICS:
${input.lyrics}`
}

/** A random direction from scratch; the palette is examples, not a menu. */
export const buildRandomStylePrompt = (
  random: () => number = Math.random,
): string => `Invent a brand new musical direction for a text-to-song model (YuE2).
Commit fully to one clear, specific direction and be adventurous.

The palette below is examples to spark a direction — not a menu. Invent beyond it
whenever a better direction comes to mind, and never fall back on the same safe pick
twice. The lists are shuffled on every call.

${paletteLine("Genres", genreHints, random)}
${paletteLine("Voices", voiceHints, random)}
${paletteLine("Production", productionHints, random)}
${paletteLine("Register", registerHints, random)}

Make every dimension explicit — never leave the vocalist implied or the genre generic:

${styleBriefDimensions}

${styleStackRule}
${plainTextRule}
${wordsRule}
The lyrics are English — lead the stack with English.
Write the stack under ${maxStyleWords} words. Output ONLY the brief — no preamble,
no labels, no quotes, no commentary.
`

/**
 * A full lyric sheet with no style context. Feeding the style brief in makes the
 * model sing its vocabulary back, so the lyrics are written style-blind.
 */
export const buildRandomLyricsPrompt =
  (): string => `Write the complete lyric sheet in English for a brand new song.

Rules, all mandatory:
- ${lyricsLineRule}
- ${plainTextRule}
- 150 to 400 words.
- ${wordsRule}

Output ONLY the lyric sheet — no preamble, no commentary.

LYRICS:`

const sectionTagLine = /^\s*\[[^\]]+\]\s*$/

const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word !== "").length

/** Sung words only — section tags do not count against the sheet's budget. */
const sungWordCount = (text: string): number =>
  text
    .split("\n")
    .filter((line) => !sectionTagLine.test(line))
    .join(" ")
    .split(/\s+/)
    .filter((word) => word !== "").length

/** A style brief must say something and respect the word cap. */
export const isUsableStyleBrief = (text: string): boolean => {
  const words = wordCount(text)
  return words > 0 && words <= maxStyleWords
}

/** A lyric sheet needs section tags and a full song's worth of sung words. */
export const isUsableLyrics = (text: string): boolean =>
  text.split("\n").some((line) => sectionTagLine.test(line)) &&
  sungWordCount(text) >= minLyricsWords &&
  sungWordCount(text) <= maxLyricsWords

/** The model must return usable text; fences and quotes are tolerated. */
export const parseEnhanceText = (raw: string): string | null => {
  const text = cleanAgentText(raw)
  return text === "" ? null : text
}
