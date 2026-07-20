import { test, expect, _electron } from '@playwright/test'
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { ElectronApplication } from 'playwright'

const desktopDir = join(__dirname, '..')
// This venv is created by runtime/setup.mjs (task 0.6) — not committed, must
// already exist on the machine running this test.
const venvPython = join(desktopDir, '../../runtime/.hermes-venv/Scripts/python.exe')
// afterAll gives app.close() a grace period, then force-kills whatever is
// left so a hung close (see task 1.5.11) never leaves zombie processes or a
// held port behind.
const closeGraceMs = 90000

let mock: ChildProcessWithoutNullStreams
let app: ElectronApplication
// electron.exe PIDs that already existed before we launched the app under
// test — used to spot leaked helper processes (GPU/renderer) that escape the
// tree-kill below because Chromium reparents or sandboxes them.
let preExistingElectronPids = new Set<number>()

// Lists running electron.exe PIDs (Windows-only; empty elsewhere).
function listElectronPids(): Set<number> {
  if (process.platform !== 'win32') return new Set()
  try {
    const output = execFileSync(
      'tasklist',
      ['/fi', 'IMAGENAME eq electron.exe', '/fo', 'csv', '/nh'],
      { encoding: 'utf8' }
    )
    const pids = new Set<number>()
    for (const line of output.split('\n')) {
      const match = line.match(/^"[^"]*","(\d+)"/)
      if (match) pids.add(Number(match[1]))
    }
    return pids
  } catch {
    return new Set()
  }
}

// Allocates an OS-assigned free port instead of a hardcoded one, so a leaked
// process from a previous run (or a parallel run) can't collide on bind.
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('failed to allocate a free port'))
        }
      })
    })
  })
}

// child_process#kill() on Windows only signals the process itself, not the
// tree Electron/child processes spawn under it — use taskkill /t so a hung
// close doesn't leave orphans behind.
function killProcessTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      // taskkill routinely reports "process not found" for a child that
      // already exited on its own (the race this function guards against) —
      // ignore its stdio so that expected, harmless outcome doesn't spam
      // the test log.
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // already exited — nothing to do
  }
}

test.beforeAll(async () => {
  const mockPort = await getFreePort()
  const mockScript = join(desktopDir, 'e2e', 'mock_gateway.py')
  mock = spawn(venvPython, [mockScript, String(mockPort)], { cwd: desktopDir })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('mock_gateway.py did not print MOCK_READY within 15s')),
      15000
    )
    let output = ''
    mock.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('MOCK_READY')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    mock.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    mock.on('error', (error) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `mock gateway python not found at ${venvPython} — run \`node runtime/setup.mjs\` first (${error.message})`
        )
      )
    })
    mock.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`mock_gateway.py exited early with code ${code}: ${output}`))
      }
    })
  })

  preExistingElectronPids = listElectronPids()

  app = await _electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      AEC_GATEWAY_URL: `ws://127.0.0.1:${mockPort}/api/ws`
    }
  })
})

test.afterAll(async () => {
  test.setTimeout(closeGraceMs + 30000)
  const electronPid = app?.process()?.pid

  try {
    await Promise.race([
      app?.close(),
      new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`app.close() did not resolve within ${closeGraceMs}ms`)),
          closeGraceMs
        )
      )
    ])
  } catch (error) {
    console.warn(`[e2e] ${(error as Error).message} — force-killing the Electron process`)
  } finally {
    killProcessTree(electronPid)
    killProcessTree(mock?.pid)
    // Chromium's own child processes (GPU/renderer) are sometimes not
    // reachable through the tree-kill above (reparented or sandboxed) — sweep
    // for any electron.exe that appeared during this run and is still alive.
    for (const pid of listElectronPids()) {
      if (!preExistingElectronPids.has(pid)) killProcessTree(pid)
    }
  }
})

test('chat panel connects to the mock gateway and streams a reply', async () => {
  const page = await app.firstWindow()

  await expect(page.getByText('Подключено')).toBeVisible({ timeout: 15000 })

  const input = page.getByPlaceholder('Спросите про проект…')
  await input.fill('ping')
  await input.press('Enter')

  await expect(page.getByText('ping')).toBeVisible()
  await expect(page.getByText('PONG')).toBeVisible({ timeout: 15000 })
})
