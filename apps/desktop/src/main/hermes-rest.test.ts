import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { hermesRest } from './hermes-rest'
import { SESSION_TOKEN_HEADER } from './hermes-rest-pure'

const token = 'a'.repeat(48)
let server: Server | undefined

afterEach(async () => {
  server?.closeAllConnections()
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

async function serve(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void
): Promise<{ host: string; port: number; token: string }> {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf-8')))
    req.on('end', () => handler(req, res, body))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return { host: '127.0.0.1', port: (server!.address() as AddressInfo).port, token }
}

describe('hermesRest transport', () => {
  it('sends method, token header, JSON body and query; parses JSON', async () => {
    const target = await serve((req, res, body) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          token: req.headers[SESSION_TOKEN_HEADER.toLowerCase()],
          length: req.headers['content-length'],
          body: JSON.parse(body)
        })
      )
    })
    const result = await hermesRest<Record<string, unknown>>(target, '/api/x', {
      method: 'POST',
      body: { name: 'смета' },
      query: { profile: 'smeta-kopiya' }
    })
    expect(result).toEqual({
      method: 'POST',
      url: '/api/x?profile=smeta-kopiya',
      token,
      length: String(Buffer.byteLength(JSON.stringify({ name: 'смета' }))),
      body: { name: 'смета' }
    })
  })

  // Decision 0017 (T53.2): on the single gateway a fresh one-use ticket rides each request,
  // minted for the final URL — after the path got its profile selector.
  it('on a gateway target sends a fresh ticket per request and no session token', async () => {
    const seen: Array<{ url?: string; ticket: unknown; token: unknown }> = []
    const served = await serve((req, res) => {
      seen.push({
        url: req.url,
        ticket: req.headers['x-hermes-gateway-ticket'],
        token: req.headers[SESSION_TOKEN_HEADER.toLowerCase()]
      })
      res.end('{}')
    })
    const minted: string[] = []
    const target = {
      ...served,
      token: '',
      grant: async (url: string, method: string) => {
        minted.push(`${method} ${new URL(url).pathname}${new URL(url).search}`)
        return { headers: { 'X-Hermes-Gateway-Ticket': `t${minted.length}` } }
      },
      scopePath: (path: string) => `${path}?profile=default`
    }
    await hermesRest(target, '/api/cron/jobs')
    await hermesRest(target, '/api/cron/jobs')
    expect(minted).toEqual([
      'GET /api/cron/jobs?profile=default',
      'GET /api/cron/jobs?profile=default'
    ])
    expect(seen).toEqual([
      { url: '/api/cron/jobs?profile=default', ticket: 't1', token: undefined },
      { url: '/api/cron/jobs?profile=default', ticket: 't2', token: undefined }
    ])
  })

  // T53.2 review: a grant that found the gateway again on a new port sends the request there.
  it('sends the request to the base address the grant answered', async () => {
    const served = await serve((req, res) => res.end(JSON.stringify({ url: req.url })))
    const target = {
      host: '',
      port: 0,
      token: '',
      baseUrl: 'http://127.0.0.1:9',
      grant: async () => ({
        headers: { 'X-Hermes-Gateway-Ticket': 't' },
        baseUrl: `http://${served.host}:${served.port}`
      })
    }
    expect(await hermesRest(target, '/api/status')).toEqual({ url: '/api/status' })
  })

  it('turns an HTTP error into the core detail with the token redacted', async () => {
    const target = await serve((_req, res) => {
      res.statusCode = 409
      res.end(JSON.stringify({ detail: `Job is already running ${token}` }))
    })
    const error = await hermesRest(target, '/api/x', { method: 'POST' }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Job is already running')
    expect((error as Error).message).not.toContain(token)
  })

  it('keeps its own timeout', async () => {
    const target = await serve(() => undefined)
    await expect(hermesRest(target, '/api/x', { timeoutMs: 300 })).rejects.toThrow(
      'Ядро не ответило за 0 с'
    )
  })

  it('reports a refused connection as unreachable core', async () => {
    const target = await serve(() => undefined)
    server!.close()
    server = undefined
    await expect(hermesRest(target, '/api/x')).rejects.toThrow(/^Не удалось обратиться к ядру/)
  })

  // Регрессия 30.09.2026: `fetch` из Node сам обрывал ответ через 300 с
  // (UND_ERR_HEADERS_TIMEOUT) — «Запустить сейчас» у долгой рутины падало с
  // «fetch failed». Пять минут ожидания — только по флагу.
  it.runIf(process.env.AEC_SLOW_REST === '1')(
    'waits past 300 s when the caller allows it',
    async () => {
      const target = await serve((_req, res) => {
        setTimeout(() => res.end('{"ok":true}'), 310_000)
      })
      await expect(
        hermesRest(target, '/api/x', { method: 'POST', timeoutMs: 600_000 })
      ).resolves.toEqual({
        ok: true
      })
    },
    330_000
  )
})
