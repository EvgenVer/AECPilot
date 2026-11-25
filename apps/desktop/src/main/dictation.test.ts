// Local dictation in the main process (UR49, task T59): the voice border in every profile, the
// download with the person's consent, and what the microphone's gate answers. Temporary
// folders only; the network and the core's Python are stood in for.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'

import { Dictation, dictationInstalled, holdVoiceConfig, type DictationDeps } from './dictation'
import {
  applyDictationConfig,
  coreRecognisesLocally,
  DICTATION_MARKER,
  DICTATION_MODEL,
  dictationFileUrl,
  dictationModelDir,
  gatewayJsonWithoutVoice,
  isDictationUpload,
  parseDictationMarker,
  requestProfile
} from './dictation-pure'

const REPO = join(__dirname, '../../../..')

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aec-t59-dictation-'))
  writeFileSync(join(home, 'config.yaml'), 'model:\n  default: x\n')
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

/** Files of the right size without half a gigabyte on the disk. */
function sparse(path: string, size: number): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
  truncateSync(path, size)
}

function install(): void {
  const dir = dictationModelDir(home)
  for (const file of DICTATION_MODEL.files) sparse(join(dir, file.name), file.size)
  writeFileSync(
    join(dir, DICTATION_MARKER),
    JSON.stringify({
      id: DICTATION_MODEL.id,
      revision: DICTATION_MODEL.revision,
      files: DICTATION_MODEL.files.map(({ name, size }) => ({ name, size }))
    })
  )
}

function make(patch: Partial<DictationDeps> = {}): Dictation {
  return new Dictation({
    hermesHome: () => Promise.resolve(home),
    python: () => Promise.reject(new Error('no python in this test')),
    remote: () => false,
    // The core of this test runs on the file, as the real one does.
    coreConfig: () => Promise.resolve(parsed(config())),
    freeBytes: () => 10_000_000_000,
    onChange: () => {},
    probeEngine: () => Promise.resolve(true),
    download: (_url, dest) => {
      const file = DICTATION_MODEL.files.find((candidate) => basename(dest) === candidate.name)
      if (!file) throw new Error(`unexpected file ${dest}`)
      sparse(dest, file.size)
      return Promise.resolve()
    },
    ...patch
  })
}

const config = (dir = home): string => readFileSync(join(dir, 'config.yaml'), 'utf-8')

/** What the core would make of the file: one document, no duplicate keys. */
function parsed(text: string): Record<string, Record<string, unknown>> {
  return parse(text, { merge: true, uniqueKeys: true }) as Record<string, Record<string, unknown>>
}

describe('the voice border of a profile', () => {
  it('without a model recognition is off, and the provider is already the local one', () => {
    const config = parsed(applyDictationConfig('model:\n  default: x\n', null).text)
    expect(config.stt).toEqual({
      enabled: false,
      provider: 'local',
      language: 'ru',
      streaming: false
    })
    expect(config.voice).toEqual({ client_direct: false })
    expect(config.wake_word).toEqual({ enabled: false })
    expect(config.model).toEqual({ default: 'x' })
  })

  it('the model is the folder on disk, so the core never asks Hugging Face', () => {
    const dir = dictationModelDir(home)
    expect(parsed(applyDictationConfig('', dir).text).stt).toEqual({
      enabled: true,
      provider: 'local',
      language: 'ru',
      streaming: false,
      local: {
        model: dir,
        language: 'ru',
        device: 'cpu',
        compute_type: 'int8',
        unload_after_idle_seconds: 900
      }
    })
  })

  // Review T59: a line editor added a second key to each of these and reported success; the
  // core refuses a duplicate key and runs on the last config it could read — the cloud one.
  it.each([
    ['plain', 'stt:\n  enabled: true\n  provider: groq\n'],
    [
      'a comment at column 0 inside the section',
      'stt:\n# note\n  enabled: true\n  provider: groq\n'
    ],
    ['a quoted key', 'stt:\n  "provider": groq\n'],
    ['a quoted section', '"stt":\n  provider: groq\n'],
    ['a space before the colon', 'stt :\n  provider : groq\n'],
    ['a section indented by four', 'stt:\n    provider: groq\n    enabled: true\n'],
    ['a section indented by one', 'stt:\n provider: groq\n'],
    ['a block scalar value', 'stt:\n  provider: >-\n    groq\n'],
    ['an inline map', 'stt: {provider: groq, enabled: true}\n'],
    ['an inline root', '{stt: {provider: groq}}\n'],
    ['an empty section', 'stt:\nwake_word:\n  enabled: true\n'],
    ['a subsection that is null', 'stt:\n  local:\n  provider: groq\n'],
    ['a subsection indented by six', 'stt:\n  local:\n      model: large-v3\n  provider: groq\n'],
    [
      'a folded model path',
      'stt:\n  local:\n    model: C:\\old\n\n      folder\\x\n  provider: groq\n'
    ],
    ['a merge key', 'base: &b\n  provider: groq\nstt:\n  <<: *b\n  enabled: true\n'],
    ['a list where a value belongs', 'stt:\n  provider:\n    - groq\n'],
    ['a string "false" that the core reads as on', 'wake_word:\n  enabled: "false"\n'],
    ['CRLF', 'stt:\r\n  provider: groq\r\n  enabled: true\r\n'],
    ['BOM', '\uFEFFstt:\n  provider: groq\n']
  ])('%s: the cloud provider is put back, the file stays readable', (_name, yaml) => {
    const result = applyDictationConfig(yaml, 'C:\\m')
    expect(result.ok).toBe(true)
    const config = parsed(result.text)
    expect(config.stt).toMatchObject({ enabled: true, provider: 'local', language: 'ru' })
    expect((config.stt.local as Record<string, unknown>).model).toBe('C:\\m')
    expect(config.wake_word).toEqual({ enabled: false })
    // The second pass finds nothing to do: the file is not rewritten at every start.
    expect(applyDictationConfig(result.text, 'C:\\m')).toEqual({
      text: result.text,
      changed: false,
      ok: true
    })
  })

  it.each([
    ['a section that is a word', 'stt: off\n'],
    ['a section that is a list', 'stt:\n  - x\n'],
    ['an alias to somewhere else', 'a: &a\n  provider: groq\nstt: *a\n'],
    ['the section twice', 'stt:\n  provider: groq\nstt:\n  enabled: true\n'],
    ['two documents', 'a: 1\n---\nstt:\n  provider: groq\n'],
    ['a broken file', 'stt:\n  provider: [groq\n'],
    ['a list instead of a map', '- 1\n']
  ])('%s is refused and left as it is', (_name, yaml) => {
    expect(applyDictationConfig(yaml, 'C:\\m')).toEqual({ text: yaml, changed: false, ok: false })
  })

  it('comments, order, lists and the text of other values survive', () => {
    const yaml =
      '# top\nmodel:\n  default: x # keep\ntoolsets:\n- a\n- b\nagent:\n  max_turns: 0o17\n' +
      `  note: ${'очень длинная строка '.repeat(12)}\n  yes_word: yes\n\n# tail\nstt:\n  provider: groq # why\n`
    const { text, ok } = applyDictationConfig(yaml, null)
    expect(ok).toBe(true)
    for (const line of yaml.split('\n').filter((line) => line && !line.includes('groq'))) {
      expect(text.split('\n')).toContain(line.trimEnd())
    }
  })

  it('a file rewritten by the core — unquoted, folded over two lines — stays as it is', () => {
    const dir = 'C:\\Users\\Имя Фамилия\\папка'
    const first = applyDictationConfig('', dir).text
    const rewritten = first.replace('Имя Фамилия', () => 'Имя\n      Фамилия')
    expect(rewritten).not.toBe(first)
    expect(applyDictationConfig(rewritten, dir).changed).toBe(false)
  })

  it('every specialist has the border too — its config decides for its chats', () => {
    const own = join(home, 'profiles', 'kr')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'config.yaml'), 'stt:\n  provider: openai\n')
    expect(holdVoiceConfig(home, true)).toBe(true)
    const voice = parsed(config(own)).stt
    expect(voice.provider).toBe('local')
    // The model is one for all profiles.
    expect((voice.local as Record<string, unknown>).model).toBe(dictationModelDir(home))
    expect(JSON.parse(readFileSync(join(own, 'gateway.json'), 'utf-8'))).toEqual({
      stt_enabled: false
    })
    expect(readdirSync(own).sort()).toEqual(['config.yaml', 'gateway.json'])
  })

  it('a file that cannot be held is reported and untouched; the others are held', () => {
    const own = join(home, 'profiles', 'kr')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'config.yaml'), 'stt: off\n')
    expect(holdVoiceConfig(home, true)).toBe(false)
    expect(config(own)).toBe('stt: off\n')
    expect(parsed(config()).stt.provider).toBe('local')
  })
})

describe('what the core says it will recognise with', () => {
  const dir = 'C:\\p\\aec\\dictation-models\\turbo-0a363e91'
  const good = { stt: { enabled: true, provider: 'local', local: { model: dir } } }

  it('our folder on this machine, however its separators are written', () => {
    expect(coreRecognisesLocally(good, dir)).toBe(true)
    expect(
      coreRecognisesLocally(
        { stt: { ...good.stt, local: { model: dir.replaceAll('\\', '/') } } },
        dir
      )
    ).toBe(true)
  })

  it.each([
    ['a cloud provider', { stt: { ...good.stt, provider: 'groq' } }],
    ['recognition off', { stt: { ...good.stt, enabled: false } }],
    [
      'the core defaults: it would download base itself',
      { stt: { enabled: true, local: { model: 'base' } } }
    ],
    ['a model by name', { stt: { ...good.stt, local: { model: 'large-v3' } } }],
    ['another folder', { stt: { ...good.stt, local: { model: 'C:\\other' } } }],
    ['live streaming', { stt: { ...good.stt, streaming: true } }],
    ['nothing', null],
    ['no section', {}]
  ])('%s — no recording', (_name, answer) => {
    expect(coreRecognisesLocally(answer, dir)).toBe(false)
    expect(coreRecognisesLocally(answer, null)).toBe(false)
  })

  it('on a server the folder is ours by its name, on any drive and system', () => {
    const at = (model: string): unknown => ({ stt: { ...good.stt, local: { model } } })
    expect(coreRecognisesLocally(at('E:\\srv\\aec\\dictation-models\\medium-08e178d4'), null)).toBe(
      true
    )
    expect(coreRecognisesLocally(at('/srv/aec/dictation-models/turbo-0a363e91'), null)).toBe(true)
    expect(coreRecognisesLocally(at('/srv/aec/dictation-models/large-00000000'), null)).toBe(false)
    expect(coreRecognisesLocally(at('/srv/models/turbo-0a363e91'), null)).toBe(false)
  })
})

describe('voice messages of the messengers stay unrecognised (HX19)', () => {
  it('the switch is added next to what the file already says', () => {
    const added = (text: string | null): unknown =>
      JSON.parse(gatewayJsonWithoutVoice(text).text ?? 'null')
    expect(added('{"stt_enabled": true, "x": 1}')).toEqual({ stt_enabled: false, x: 1 })
    expect(added(null)).toEqual({ stt_enabled: false })
  })

  it('nothing to write when it is off already; a broken file is refused, not «fine»', () => {
    expect(gatewayJsonWithoutVoice('{"stt_enabled": false}')).toEqual({ text: null, ok: true })
    expect(gatewayJsonWithoutVoice('{')).toEqual({ text: null, ok: false })
    expect(gatewayJsonWithoutVoice('[]')).toEqual({ text: null, ok: false })
    writeFileSync(join(home, 'gateway.json'), '{')
    expect(holdVoiceConfig(home, true)).toBe(false)
  })

  it('the core still reads that switch before `stt.enabled`', () => {
    const source = readFileSync(join(REPO, 'runtime/.hermes-src/gateway/config.py'), 'utf-8')
    expect(source).toContain(
      'stt_enabled=_coerce_bool(stt_setting("stt_enabled", "enabled"), True)'
    )
    expect(source).toMatch(
      /def stt_setting\(flat_key[^)]*\).*\s+value = data\.get\(flat_key\)\s+return .* if value is None else value/
    )
    expect(source).toContain('gateway.json')
  })
})

describe('the recording on its way to the core', () => {
  it('both routes that touch the recogniser are asked about, and no other', () => {
    expect(isDictationUpload('POST', '/api/audio/transcribe')).toBe(true)
    expect(isDictationUpload('POST', '/api/audio/stt-lease')).toBe(true)
    expect(isDictationUpload('GET', '/api/audio/voice-config')).toBe(false)
    expect(isDictationUpload('POST', '/api/config')).toBe(false)
  })

  it('the settings asked about are those of the profile in the request', () => {
    expect(requestProfile('/api/audio/transcribe?profile=kr')).toBe('kr')
    expect(requestProfile('/api/audio/transcribe')).toBeNull()
  })
})

describe('the model on disk', () => {
  it('is there only with the marker of this revision and every file of its size', () => {
    expect(dictationInstalled(home)).toBe(false)
    install()
    expect(dictationInstalled(home)).toBe(true)
    sparse(join(dictationModelDir(home), 'model.bin'), 10)
    expect(dictationInstalled(home)).toBe(false)
  })

  it('a marker cannot point outside its folder', () => {
    const marker = { id: 'turbo', revision: 'r', files: [{ name: '../x', size: 1 }] }
    expect(parseDictationMarker(JSON.stringify(marker))).toBeNull()
    expect(parseDictationMarker('{}')).toBeNull()
    expect(parseDictationMarker('not json')).toBeNull()
  })

  it('downloads from one pinned commit, with a checksum for every file', () => {
    for (const file of DICTATION_MODEL.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(dictationFileUrl(DICTATION_MODEL, file)).toContain(
        `/resolve/${DICTATION_MODEL.revision}/`
      )
    }
    expect(DICTATION_MODEL.revision).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('setting dictation up and taking it away', () => {
  const off = (): boolean => parsed(config()).stt?.enabled !== true

  it('asked for nothing — nothing is downloaded and recognition is off', async () => {
    const download = vi.fn()
    const status = await make({ download }).status()
    expect(status).toMatchObject({ engine: true, installed: false, ready: false, remote: false })
    expect(download).not.toHaveBeenCalled()
  })

  it('downloads every file, reports progress and turns recognition on', async () => {
    const seen: number[] = []
    const dictation = make({
      download: (_url, dest, sha, onProgress) => {
        const file = DICTATION_MODEL.files.find((candidate) => basename(dest) === candidate.name)!
        expect(sha).toBe(file.sha256)
        onProgress({ step: 'model', detail: '', doneBytes: file.size, totalBytes: file.size })
        sparse(dest, file.size)
        return Promise.resolve()
      },
      onChange: () => {
        void dictation.status().then((status) => seen.push(status.progress?.doneBytes ?? 0))
      }
    })
    expect(await dictation.setup()).toEqual({ ok: true })
    expect(Math.max(...seen)).toBeGreaterThan(DICTATION_MODEL.files[0].size)
    expect(await dictation.status()).toMatchObject({ busy: false, installed: true, ready: true })
    expect(off()).toBe(false)
    expect(await dictation.mayRecord()).toBe(true)
  })

  it('a failed download leaves recognition off and says why; a second try goes on', async () => {
    let fail = true
    const asked: string[] = []
    const dictation = make({
      download: (url, dest) => {
        asked.push(url)
        const file = DICTATION_MODEL.files.find((candidate) => basename(dest) === candidate.name)!
        if (fail && file.name === 'model.bin') return Promise.reject(new Error('нет сети'))
        sparse(dest, file.size)
        return Promise.resolve()
      }
    })
    expect(await dictation.setup()).toEqual({ ok: false, error: 'нет сети' })
    expect(await dictation.status()).toMatchObject({
      error: 'нет сети',
      ready: false,
      leftovers: true
    })
    expect(off()).toBe(true)
    fail = false
    asked.length = 0
    expect((await dictation.setup()).ok).toBe(true)
    expect(asked).toHaveLength(1)
  })

  it('two requests at once: one download, the second is told it is busy', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const download = vi.fn((_url: string, dest: string) =>
      gate.then(() => {
        const file = DICTATION_MODEL.files.find((candidate) => basename(dest) === candidate.name)!
        sparse(dest, file.size)
      })
    )
    const dictation = make({ download })
    const first = dictation.setup()
    expect((await dictation.setup()).ok).toBe(false)
    expect((await dictation.remove()).ok).toBe(false)
    release()
    expect((await first).ok).toBe(true)
    expect(download).toHaveBeenCalledTimes(DICTATION_MODEL.files.length)
  })

  it('an interrupted download needs room only for the rest of it', async () => {
    const file = DICTATION_MODEL.files.find((candidate) => candidate.name === 'model.bin')!
    const dir = dictationModelDir(home)
    mkdirSync(dir, { recursive: true })
    sparse(join(dir, 'model.bin.part'), file.size - 1_000_000)
    const download = vi.fn((_url: string, dest: string) => {
      sparse(dest, DICTATION_MODEL.files.find((c) => c.name === basename(dest))!.size)
      return Promise.resolve()
    })
    const dictation = make({ download, freeBytes: () => 400_000_000 })
    expect(await dictation.setup()).toEqual({ ok: true })
  })

  it('a full disk is said before the download, not in the middle of it', async () => {
    const download = vi.fn()
    const dictation = make({ download, freeBytes: () => 1_000_000 })
    expect((await dictation.setup()).ok).toBe(false)
    expect(download).not.toHaveBeenCalled()
  })

  it('an earlier model of ours is cleared away, a neighbour is not', async () => {
    const root = join(home, 'aec', 'dictation-models')
    sparse(join(root, 'base-ebe41f70', 'model.bin'), 10)
    sparse(join(root, 'own-models', 'model.bin'), 10)
    expect((await make().setup()).ok).toBe(true)
    expect(readdirSync(root).sort()).toEqual(
      ['own-models', basename(dictationModelDir(home))].sort()
    )
  })

  it('without the recognition packages nothing is downloaded', async () => {
    const download = vi.fn()
    const dictation = make({ download, probeEngine: () => Promise.resolve(false) })
    expect((await dictation.setup()).ok).toBe(false)
    expect(download).not.toHaveBeenCalled()
  })

  it('a config that cannot be held: set-up fails and every profile is back to off', async () => {
    const own = join(home, 'profiles', 'kr')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'config.yaml'), 'stt: off\n')
    expect((await make().setup()).ok).toBe(false)
    expect(off()).toBe(true)
  })

  it('the core answering with a cloud provider refuses, whatever the file says', async () => {
    install()
    const dictation = make({
      coreConfig: () => Promise.resolve({ stt: { enabled: true, provider: 'groq' } })
    })
    expect(await dictation.mayRecord()).toBe(false)
    const status = await dictation.status()
    expect(status).toMatchObject({ installed: true, ready: false })
    expect(status.error).toBeTruthy()
  })

  it('a core that does not answer refuses', async () => {
    install()
    const dictation = make({ coreConfig: () => Promise.reject(new Error('starting')) })
    expect(await dictation.mayRecord()).toBe(false)
  })

  it('the profile of the recording is the one asked about', async () => {
    install()
    const coreConfig = vi.fn(() => Promise.resolve(parsed(config())))
    await make({ coreConfig }).mayRecord('kr')
    expect(coreConfig).toHaveBeenCalledWith('kr')
  })

  it('a config drifted to a cloud after the start is put back before the microphone opens', async () => {
    install()
    const dictation = make()
    writeFileSync(join(home, 'config.yaml'), 'stt:\n  enabled: true\n  provider: groq\n')
    expect(await dictation.mayRecord()).toBe(true)
    expect(config()).not.toContain('groq')
  })

  it('removal turns recognition off and deletes only our folder', async () => {
    install()
    const neighbour = join(home, 'aec', 'dictation-models', 'own-notes.txt')
    writeFileSync(neighbour, 'mine')
    const dictation = make()
    expect(await dictation.remove()).toEqual({ ok: true })
    expect(existsSync(dictationModelDir(home))).toBe(false)
    expect(readFileSync(neighbour, 'utf-8')).toBe('mine')
    expect(off()).toBe(true)
    expect((await dictation.status()).ready).toBe(false)
  })

  it('a model the core still holds open stays whole and on, and it is said in words', async () => {
    install()
    // Windows refuses to delete a file opened without sharing; a folder stands in for it.
    const bin = join(dictationModelDir(home), 'model.bin')
    rmSync(bin)
    mkdirSync(bin)
    writeFileSync(join(bin, 'held'), '')
    const dictation = make()
    const answer = await dictation.remove()
    expect(answer.ok).toBe(false)
    expect(existsSync(join(dictationModelDir(home), DICTATION_MARKER))).toBe(true)
  })
})

describe('the core on another machine', () => {
  it('asks that core, and never downloads or writes here', async () => {
    const before = config()
    const download = vi.fn()
    const remote = { remote: () => true, download }
    const off = make({ ...remote, coreConfig: () => Promise.resolve({ stt: { enabled: false } }) })
    expect(await off.status()).toMatchObject({ remote: true, ready: false })
    expect((await off.setup()).ok).toBe(false)
    expect((await off.remove()).ok).toBe(false)
    expect(await off.mayRecord()).toBe(false)

    const model = 'D:\\srv\\aec\\dictation-models\\turbo-0a363e91'
    const on = make({
      ...remote,
      coreConfig: () =>
        Promise.resolve({ stt: { enabled: true, provider: 'local', local: { model } } })
    })
    expect(await on.mayRecord()).toBe(true)
    expect(download).not.toHaveBeenCalled()
    expect(config()).toBe(before)
  })

  it('a server that does not answer is a server without dictation', async () => {
    const dictation = make({
      remote: () => true,
      coreConfig: () => Promise.reject(new Error('offline'))
    })
    expect(await dictation.mayRecord()).toBe(false)
  })
})
