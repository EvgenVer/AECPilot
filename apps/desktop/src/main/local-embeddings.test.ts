// Task T83: the model download — resumed from a `.part`, checked against its
// SHA256, never left half-written under the final name. A local HTTP server
// stands in for Hugging Face; the folder is a fresh temp one, removed after.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { downloadFile, localTargetSync } from './local-embeddings'

const payload = Buffer.from('GGUF' + 'x'.repeat(100_000))
const sha = createHash('sha256').update(payload).digest('hex')

let dir: string
let server: Server
let base: string
const ranges: (string | undefined)[] = []

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aec-t83-download-'))
  ranges.length = 0
  server = createServer((request, response) => {
    const range = request.headers.range
    ranges.push(range)
    const match = range ? /bytes=(\d+)-/.exec(range) : null
    if (match && Number(match[1]) >= payload.length) {
      response.writeHead(416)
      response.end()
      return
    }
    if (match) {
      const from = Number(match[1])
      response.writeHead(206, { 'Content-Length': String(payload.length - from) })
      response.end(payload.subarray(from))
      return
    }
    response.writeHead(200, { 'Content-Length': String(payload.length) })
    response.end(payload)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

describe('model download (T83)', () => {
  it('lands the file under its name after the checksum matches', async () => {
    const dest = join(dir, 'm.gguf')
    await downloadFile(`${base}/m.gguf`, dest, sha, () => {})
    expect(readFileSync(dest).equals(payload)).toBe(true)
    expect(existsSync(dest + '.part')).toBe(false)
  })

  it('resumes an interrupted download from where the .part stopped', async () => {
    const dest = join(dir, 'm.gguf')
    writeFileSync(dest + '.part', payload.subarray(0, 40_000))
    await downloadFile(`${base}/m.gguf`, dest, sha, () => {})
    expect(ranges).toEqual(['bytes=40000-'])
    expect(readFileSync(dest).equals(payload)).toBe(true)
  })

  it('takes a finished .part the server answers 416 for: verified and placed, not stuck (review T84)', async () => {
    const dest = join(dir, 'm.gguf')
    writeFileSync(dest + '.part', payload)
    await downloadFile(`${base}/m.gguf`, dest, sha, () => {})
    expect(ranges).toEqual([`bytes=${payload.length}-`])
    expect(readFileSync(dest).equals(payload)).toBe(true)
  })

  it('drops a file whose checksum does not match, and keeps no model under the final name', async () => {
    const dest = join(dir, 'm.gguf')
    await expect(downloadFile(`${base}/m.gguf`, dest, '0'.repeat(64), () => {})).rejects.toThrow()
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(dest + '.part')).toBe(false)
  })

  it('reads the index target from the state file, with the kept port', () => {
    expect(localTargetSync(dir)).toBeNull()
    const aec = join(dir, 'aec')
    rmSync(aec, { recursive: true, force: true })
    mkdirSync(aec)
    writeFileSync(
      join(aec, 'local-embeddings.json'),
      JSON.stringify({ model: { id: 'bge-m3', path: 'C:/m/bge-m3-Q8_0.gguf' }, port: 50001 })
    )
    expect(localTargetSync(dir)).toEqual({ baseUrl: 'http://127.0.0.1:50001/v1', model: 'bge-m3' })
  })
})
