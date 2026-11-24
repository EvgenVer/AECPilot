// Local dictation (UR49, task T59): which model, where it lies, and which keys of the
// core's `config.yaml` the product holds. No Electron, no network.
//
// WHY THE MODEL IS OURS TO DOWNLOAD. Left alone, the core fetches the model from Hugging
// Face by itself on the first recording (`_create_whisper_model`) — without a question, a
// progress or a checksum. So `stt.enabled` stays false until the person has agreed and the
// files are on disk and verified, and `stt.local.model` is the FOLDER: faster-whisper
// opens a folder without touching the network. The path keeps its backslashes on Windows on
// purpose: a path with `/` that no longer exists would be taken for a Hugging Face repo name.

import { join } from 'node:path'

import { isMap, isScalar, parseDocument, type Document } from 'yaml'

export interface DictationFile {
  name: string
  size: number
  sha256: string
}

export interface DictationModel {
  id: string
  repo: string
  /** Commit of the repository: what is downloaded cannot change under us. */
  revision: string
  license: string
  files: readonly DictationFile[]
}

/** The default chosen by the T58 benchmark (`eval/reports/dictation.md`). Sizes and
 *  SHA256 — from the Hugging Face record of this very commit. */
// --8<-- [start:dictation_model]
export const DICTATION_MODEL: DictationModel = {
  id: 'small',
  repo: 'Systran/faster-whisper-small',
  revision: '536b0662742c02347bc0e980a01041f333bce120',
  license: 'MIT',
  files: [
    {
      name: 'config.json',
      size: 2370,
      sha256: 'b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828'
    },
    {
      name: 'tokenizer.json',
      size: 2203239,
      sha256: 'fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab'
    },
    {
      name: 'vocabulary.txt',
      size: 459861,
      sha256: '34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913'
    },
    {
      name: 'model.bin',
      size: 483546902,
      sha256: '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671'
    }
  ]
}
// --8<-- [end:dictation_model]

export function dictationModelBytes(model: DictationModel = DICTATION_MODEL): number {
  return model.files.reduce((total, file) => total + file.size, 0)
}

export function dictationFileUrl(model: DictationModel, file: DictationFile): string {
  return `https://huggingface.co/${model.repo}/resolve/${model.revision}/${file.name}`
}

/** `<profile>/aec/dictation-models` — beside the embedding models (decision 0022). */
export function dictationModelsRoot(hermesHome: string): string {
  return join(hermesHome, 'aec', 'dictation-models')
}

/** The folder name carries the revision: a file left by another one is never taken for this
 *  one's because its size happens to match. */
export function dictationFolder(model: DictationModel = DICTATION_MODEL): string {
  return `${model.id}-${model.revision.slice(0, 8)}`
}

export function dictationModelDir(
  hermesHome: string,
  model: DictationModel = DICTATION_MODEL
): string {
  return join(dictationModelsRoot(hermesHome), dictationFolder(model))
}

/** A folder of ours under the models root — this model's or an earlier one's. */
export function isDictationFolder(name: string): boolean {
  return /^(base|small|medium)-[0-9a-f]{8}$/.test(name)
}

/** Written last, after every checksum matched: a folder without it is an unfinished
 *  download, whatever files it holds. */
export const DICTATION_MARKER = 'installed.json'

export interface DictationMarker {
  id: string
  revision: string
  files: { name: string; size: number }[]
}

export function parseDictationMarker(text: string): DictationMarker | null {
  try {
    const raw = JSON.parse(text) as Partial<DictationMarker> | null
    if (!raw || typeof raw.id !== 'string' || typeof raw.revision !== 'string') return null
    if (!Array.isArray(raw.files) || raw.files.length === 0) return null
    const files = raw.files.filter(
      (file) =>
        !!file &&
        typeof file.name === 'string' &&
        /^[\w.-]+$/.test(file.name) &&
        typeof file.size === 'number'
    )
    return files.length === raw.files.length
      ? { id: raw.id, revision: raw.revision, files: files as DictationMarker['files'] }
      : null
  } catch {
    return null
  }
}

/** The core's routes that take the recording or load the recogniser for it. */
export function isDictationUpload(method: string, route: string): boolean {
  return (
    method === 'POST' && (route === '/api/audio/transcribe' || route === '/api/audio/stt-lease')
  )
}

/** Whose settings the core will use for a request: `?profile=`, else its own. */
export function requestProfile(path: string): string | null {
  return new URL(path, 'http://core.invalid').searchParams.get('profile') || null
}

/** Seconds a loaded model may sit unused before the core drops it from memory. */
const UNLOAD_AFTER_SECONDS = 900

type ConfigValue = boolean | number | string

/**
 * The voice part of a profile's `config.yaml`, forced at every start and before every
 * recording — it is the product's border (HX19), not a default a person tunes:
 *
 * * recognition is on only with the model on disk, only `local`, only in Russian;
 * * the window never calls a recognition service itself (`voice.client_direct`), and there
 *   is no live text (`stt.streaming` exists only for cloud providers);
 * * the wake word stays off (D-184).
 *
 * The processor is named explicitly: with `auto` the core tries CUDA on any NVIDIA card,
 * and without NVIDIA's own libraries the first recording falls back to the processor only
 * after an error.
 */
function voiceKeys(modelDir: string | null): [string[], ConfigValue][] {
  const keys: [string[], ConfigValue][] = [
    [['stt', 'enabled'], modelDir !== null],
    [['stt', 'provider'], 'local'],
    [['stt', 'language'], 'ru'],
    [['stt', 'streaming'], false],
    [['voice', 'client_direct'], false],
    [['wake_word', 'enabled'], false]
  ]
  if (modelDir !== null) {
    keys.push(
      [['stt', 'local', 'model'], modelDir],
      [['stt', 'local', 'language'], 'ru'],
      [['stt', 'local', 'device'], 'cpu'],
      [['stt', 'local', 'compute_type'], 'int8'],
      [['stt', 'local', 'unload_after_idle_seconds'], UNLOAD_AFTER_SECONDS]
    )
  }
  return keys
}

export interface DictationConfigResult {
  text: string
  changed: boolean
  /** `false` — the file could not be brought to order; nothing is to be written. */
  ok: boolean
}

/**
 * Writes {@link voiceKeys} with a real YAML parser, not by lines like the other defaults of
 * `config-yaml-pure.ts`: those only ADD a key a person may keep otherwise, and a form they
 * do not recognise merely stays as it was. Here a form not recognised would leave the sound
 * going to a cloud recogniser — or the file broken by a second copy of the key, which the
 * core answers by running on the last config it could read (review T59). Comments, order and
 * the text of untouched values stay. The result is parsed again and compared before it is
 * trusted: the voice keys must be ours and everything else must be what it was.
 */
export function applyDictationConfig(
  yamlText: string,
  modelDir: string | null
): DictationConfigResult {
  const refused: DictationConfigResult = { text: yamlText, changed: false, ok: false }
  const keys = voiceKeys(modelDir)
  const parse = (text: string): Document => parseDocument(text, { merge: true })
  const holds = (doc: Document): boolean => keys.every(([path, value]) => doc.getIn(path) === value)

  const doc = parse(yamlText)
  if (doc.errors.length > 0) return refused
  if (doc.contents !== null && !isMap(doc.contents)) {
    if (!isScalar(doc.contents) || doc.contents.value !== null) return refused
  }
  if (isMap(doc.contents) && holds(doc)) return { text: yamlText, changed: false, ok: true }

  const before = withoutVoice(doc, keys)
  try {
    if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never
    for (const [path, value] of keys) {
      for (let depth = 1; depth < path.length; depth += 1) {
        const section = path.slice(0, depth)
        const node = doc.getIn(section, true)
        // `stt:` with nothing after it is an empty section, not a refusal.
        if (node === undefined || (isScalar(node) && node.value === null)) {
          doc.setIn(section, doc.createNode({}))
        }
      }
      if (doc.getIn(path) !== value) doc.setIn(path, value)
    }
  } catch {
    // A section written as a scalar, a list or an alias: not ours to rebuild.
    return refused
  }

  let text = doc.toString({ lineWidth: 0, indentSeq: !/^\S[^\n]*:\s*\r?\n- /m.test(yamlText) })
  if (yamlText.includes('\r\n')) text = text.replace(/\r?\n/g, '\r\n')
  const written = parse(text)
  if (written.errors.length > 0 || !holds(written)) return refused
  if (withoutVoice(written, keys) !== before) return refused
  return { text, changed: true, ok: true }
}

/** Everything but the voice keys, for a comparison of before and after. */
function withoutVoice(doc: Document, keys: [string[], ConfigValue][]): string {
  const copy = (doc.toJS() ?? {}) as Record<string, unknown>
  for (const [path] of keys) {
    let node: unknown = copy
    for (const key of path.slice(0, -1)) node = (node as Record<string, unknown> | undefined)?.[key]
    if (node && typeof node === 'object')
      delete (node as Record<string, unknown>)[path.at(-1) ?? '']
  }
  for (const section of ['stt', 'voice', 'wake_word']) {
    const value = copy[section] as Record<string, unknown> | null | undefined
    if (value && typeof value === 'object' && 'local' in value) {
      const local = value.local as Record<string, unknown> | null
      if (!local || Object.keys(local).length === 0) delete value.local
    }
    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
      delete copy[section]
    }
  }
  return JSON.stringify(copy)
}

/**
 * Whether the config the CORE runs on (its answer to `GET /api/config`) is the local
 * recogniser with the model of ours. Asked of the core and not read from the file: only the
 * core knows what it made of the file — its cache of the last good one, a managed layer over
 * it, the defaults of a profile that has none. `modelDir` — this machine's folder; `null` —
 * the core is on a server, where the folder is ours by its name.
 */
export function coreRecognisesLocally(config: unknown, modelDir: string | null): boolean {
  const root = record(config)
  const stt = record(root.stt)
  const model = record(stt.local).model
  if (stt.enabled !== true || stt.provider !== 'local' || stt.streaming === true) return false
  if (typeof model !== 'string') return false
  const folders = (path: string): string[] => path.split(/[\\/]+/).filter(Boolean)
  if (modelDir !== null) {
    return folders(model).join('/').toLowerCase() === folders(modelDir).join('/').toLowerCase()
  }
  const tail = folders(model).slice(-2)
  return tail[0] === 'dictation-models' && isDictationFolder(tail[1] ?? '')
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** Voice messages of the messengers are not dictation (HX19): with `stt.enabled` on, the
 *  core's gateway would start transcribing them. Its own switch is the flat `stt_enabled`
 *  of the legacy `gateway.json`, read before `stt.enabled` (`GatewayConfig.from_dict`).
 *  `text: null` — nothing to write; `ok: false` — the file is not ours to repair, and the
 *  core reads a broken one as an empty one. */
export function gatewayJsonWithoutVoice(text: string | null): { text: string | null; ok: boolean } {
  let data: Record<string, unknown> = {}
  if (text !== null && text.trim() !== '') {
    try {
      const raw = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { text: null, ok: false }
      }
      data = raw as Record<string, unknown>
    } catch {
      return { text: null, ok: false }
    }
  }
  if (data.stt_enabled === false) return { text: null, ok: true }
  return { text: JSON.stringify({ ...data, stt_enabled: false }, null, 2) + '\n', ok: true }
}
