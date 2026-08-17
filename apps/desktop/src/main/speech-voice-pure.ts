// The default text-to-speech voice, written into the core's `config.yaml`
// (task 3.7a). Line-based like its neighbours in `llm-settings-pure.ts`: the
// file belongs to hermes, carries comments, and a round-trip through a YAML
// dumper would rewrite parts nobody asked us to touch.
//
// Why a default at all. The core's is `en-US-AriaNeural`, and Edge returns an
// EMPTY audio stream for text a voice cannot pronounce — so on a clean install
// a Russian reply produces `400 "No audio was received"` and voice mode is
// simply silent (measured 2026-08-17, `runtime/speech-stream-probe.mjs`). This
// product's documents and answers are mostly Russian (SPEC C7), so the English
// default is wrong here in the way that looks like a broken feature.
//
// Measured before choosing: `ru-RU-SvetlanaNeural` speaks Russian (26 496
// bytes) AND English (16 560) — the reverse is not true, which is what makes a
// Russian voice the safe default rather than a symmetric preference. Edge has
// exactly two Russian voices; the owner picked this one 2026-08-17.

/** Owner decision 2026-08-17. Anything else — including their English default —
 * stays a user setting, changed in the voice section of the settings screen. */
export const DEFAULT_TTS_VOICE = 'ru-RU-SvetlanaNeural'

const TOP_LEVEL_LINE_RE = /^\S/
const TTS_SECTION_RE = /^tts:\s*(#.*)?$/
const TTS_SCALAR_RE = /^tts:\s*[^#\s]/
const VOICE_LINE_RE = /^\s*voice:/

export interface EnsureVoiceResult {
  text: string
  changed: boolean
  /** `tts:` exists but is a scalar (`tts: off`) — unparseable by a line-based
   * transform, so the caller leaves the file alone rather than corrupt it. */
  unexpectedStructure: boolean
}

/**
 * Adds `voice:` to the `tts:` mapping when it has none, and does nothing at all
 * otherwise.
 *
 * "Otherwise" is the important half: this runs on every start, so an existing
 * `voice:` — whoever wrote it, us on the first run or the user in settings —
 * must survive untouched. A default is a starting point, not a policy.
 */
export function ensureVoiceInConfigYaml(
  yamlText: string,
  voice: string = DEFAULT_TTS_VOICE
): EnsureVoiceResult {
  const lines = yamlText.split('\n')

  if (lines.some((line) => TTS_SCALAR_RE.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const sectionStart = lines.findIndex((line) => TTS_SECTION_RE.test(line))

  if (sectionStart === -1) {
    const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
    const block = `tts:\n  voice: ${JSON.stringify(voice)}\n`

    return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
  }

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd)
  if (sectionLines.some((line) => VOICE_LINE_RE.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const nextLines = [
    ...lines.slice(0, sectionStart + 1),
    `  voice: ${JSON.stringify(voice)}`,
    ...sectionLines,
    ...lines.slice(sectionEnd)
  ]

  return { text: nextLines.join('\n'), changed: true, unexpectedStructure: false }
}
