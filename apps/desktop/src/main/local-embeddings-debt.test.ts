// Technical debt of the T84 review (2026-11-18), closed 2026-11-19: the local
// embedding model's other-model pinning, the paused engine job, the restart rule,
// the second app on one profile and the busy guard. Hugging Face is a local HTTP
// server here; the folders are fresh temp ones, removed after.

import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mainT } from './i18n'
import { LocalEmbeddings, type EngineProbe, type LocalEmbeddingsDeps } from './local-embeddings'
import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  localModelsDir,
  localStatePath,
  parseHfRevision,
  parseLocalState,
  shouldRestart
} from './local-embeddings-pure'

const REV = 'a'.repeat(40)
const payload = Buffer.from('GGUF' + 'y'.repeat(50_000))
const sha = createHash('sha256').update(payload).digest('hex')

describe('restart rule', () => {
  it('restarts below the limit within the window and stops at it', () => {
    const now = 1_000_000_000
    expect(shouldRestart([now], now)).toBe(true)
    expect(shouldRestart([now - 1000, now], now)).toBe(true)
    const limit = Array.from({ length: CRASH_LIMIT }, (_, i) => now - i * 1000)
    expect(shouldRestart(limit, now)).toBe(false)
    // Old crashes fall out of the window.
    const old = limit.map((at) => at - CRASH_WINDOW_MS)
    expect(shouldRestart([...old, now], now)).toBe(true)
  })
})

describe('Hugging Face pin', () => {
  it('takes the commit and each file LFS sha256', () => {
    const answer = {
      sha: REV,
      siblings: [
        { rfilename: 'q/m-Q8_0.gguf', lfs: { sha256: sha, size: 1 } },
        { rfilename: 'README.md' }
      ]
    }
    expect(parseHfRevision(answer, ['q/m-Q8_0.gguf', 'README.md'])).toEqual({
      revision: REV,
      sha256: { 'q/m-Q8_0.gguf': sha, 'README.md': null }
    })
  })

  it('refuses an answer without a commit id', () => {
    expect(parseHfRevision({ sha: 'main', siblings: [] }, ['m.gguf'])).toBeNull()
    expect(parseHfRevision(null, ['m.gguf'])).toBeNull()
  })

  it('keeps the owner of the server in the state', () => {
    expect(parseLocalState('{"port":50001,"pid":10,"owner":20}')).toEqual({
      port: 50001,
      pid: 10,
      owner: 20
    })
    expect(parseLocalState('{"owner":-3}')).toEqual({})
  })
})

let home: string
let server: Server
let base: string
const requested: string[] = []

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'aec-t83-debt-'))
  requested.length = 0
  server = createServer((request, response) => {
    requested.push(request.url ?? '')
    response.writeHead(200, { 'Content-Length': String(payload.length) })
    response.end(payload)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) =>
    realFetch(String(url).replace('https://huggingface.co', base), init)
  )
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(home, { recursive: true, force: true })
})

function make(overrides: Partial<LocalEmbeddingsDeps> = {}): LocalEmbeddings {
  const probe: EngineProbe = {
    binary: join(home, 'llama-server.exe'),
    backend: 'cpu',
    gpuName: null
  }
  return new LocalEmbeddings({
    hermesHome: async () => home,
    python: async () => {
      throw new Error('no python in tests')
    },
    rest: async () => {
      throw new Error('no core in tests')
    },
    remoteReason: () => null,
    chosen: async () => false,
    onChange: () => {},
    probeEngine: async () => probe,
    ...overrides
  })
}

describe('another model from Hugging Face is pinned and checked', () => {
  it('downloads at the commit the hub reports and checks the file sha256', async () => {
    const local = make({
      hfRevision: async () => ({
        sha: REV,
        siblings: [{ rfilename: 'm-Q8_0.gguf', lfs: { sha256: sha } }]
      })
    })
    expect(await local.downloadOther('org/m-GGUF', ['m-Q8_0.gguf'])).toEqual({ ok: true })
    expect(requested).toEqual([`/org/m-GGUF/resolve/${REV}/m-Q8_0.gguf`])
    const file = join(localModelsDir(home), 'org__m-GGUF', 'm-Q8_0.gguf')
    expect(readFileSync(file).equals(payload)).toBe(true)
  })

  it('removes a file that does not match the hub checksum', async () => {
    const local = make({
      hfRevision: async () => ({
        sha: REV,
        siblings: [{ rfilename: 'm-Q8_0.gguf', lfs: { sha256: '0'.repeat(64) } }]
      })
    })
    const answer = await local.downloadOther('org/m-GGUF', ['m-Q8_0.gguf'])
    expect(answer).toEqual({ ok: false, error: mainT('local.checksum') })
    expect(existsSync(join(localModelsDir(home), 'org__m-GGUF', 'm-Q8_0.gguf'))).toBe(false)
  })

  it('downloads nothing when the hub gives no checksum', async () => {
    const local = make({ hfRevision: async () => ({ sha: REV, siblings: [] }) })
    const answer = await local.downloadOther('org/m-GGUF', ['m-Q8_0.gguf'])
    expect(answer).toEqual({ ok: false, error: mainT('local.noChecksum', 'm-Q8_0.gguf') })
    expect(requested).toEqual([])
  })
})

describe('the engine job and the busy guard', () => {
  it('waits through a pause on the core screen instead of failing', async () => {
    let installed = false
    const statuses = ['paused', 'paused', 'done']
    const details: string[] = []
    const model = join(home, 'own.gguf')
    writeFileSync(model, 'GGUF')
    const local = make({
      probeEngine: async () => ({
        binary: installed ? join(home, 'llama-server.exe') : null,
        backend: 'cpu',
        gpuName: null
      }),
      rest: async <T>(path: string): Promise<T> => {
        if (path === '/api/local-models/runtime/install') return { job_id: 'j1' } as T
        const status = statuses.shift() ?? 'done'
        if (status === 'done') installed = true
        return { status } as T
      },
      onChange: () => {
        void local.status().then((s) => s.progress && details.push(s.progress.detail))
      }
    })
    expect(await local.useFile(model)).toEqual({ ok: true })
    expect(details).toContain(mainT('local.enginePaused'))
  }, 15_000)

  it('refuses a second job and does not start the server while one runs', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let installs = 0
    const model = join(home, 'own.gguf')
    writeFileSync(model, 'GGUF')
    writeFileSync(join(home, 'llama-server.exe'), '')
    let installed = false
    const local = make({
      probeEngine: async () => ({
        binary: installed ? join(home, 'llama-server.exe') : null,
        backend: 'cpu',
        gpuName: null
      }),
      chosen: async () => true,
      rest: async <T>(path: string): Promise<T> => {
        if (path === '/api/local-models/runtime/install') {
          installs += 1
          await gate
          return { job_id: 'j1' } as T
        }
        installed = true
        return { status: 'error', error: 'stopped by the test' } as T
      }
    })
    const first = local.useFile(model)
    await vi.waitFor(() => expect(installs).toBe(1))
    expect(await local.useFile(model)).toEqual({ ok: false, error: mainT('local.busy') })
    await local.ensureRunning()
    expect(installs).toBe(1)
    expect((await local.status()).running).toBe(false)
    release()
    expect((await first).ok).toBe(false)
  })
})

describe('a second app on the same profile', () => {
  it('uses the server the other app owns and does not stop it on quit', async () => {
    // The other app: the test process's parent is alive; its server answers /health.
    const health = createServer((_request, response) => {
      response.writeHead(200)
      response.end('{"status":"ok"}')
    })
    await new Promise<void>((resolve) => health.listen(0, '127.0.0.1', resolve))
    const address = health.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const model = join(home, 'own.gguf')
    writeFileSync(model, 'GGUF')
    const statePath = localStatePath(home)
    rmSync(join(home, 'aec'), { recursive: true, force: true })
    await import('node:fs').then((fs) => fs.mkdirSync(join(home, 'aec'), { recursive: true }))
    writeFileSync(
      statePath,
      JSON.stringify({ model: { id: 'own', path: model }, port, pid: 999_999, owner: process.ppid })
    )
    try {
      const local = make()
      await local.ensureRunning()
      const status = await local.status()
      expect(status.running).toBe(true)
      expect(status.baseUrl).toBe(`http://127.0.0.1:${port}/v1`)
      local.stop()
      // The other app's record stays: its server and number are not ours.
      expect(parseLocalState(readFileSync(statePath, 'utf-8'))).toMatchObject({
        pid: 999_999,
        owner: process.ppid
      })
    } finally {
      await new Promise<void>((resolve) => health.close(() => resolve()))
    }
  })
})
