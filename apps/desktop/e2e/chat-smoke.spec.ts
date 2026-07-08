import { test, expect, _electron } from '@playwright/test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import type { ElectronApplication } from 'playwright'

const desktopDir = join(__dirname, '..')
// This venv is created by runtime/setup.mjs (task 0.6) — not committed, must
// already exist on the machine running this test.
const venvPython = join(desktopDir, '../../runtime/.hermes-venv/Scripts/python.exe')
const mockPort = 18790

let mock: ChildProcessWithoutNullStreams
let app: ElectronApplication

test.beforeAll(async () => {
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
  try {
    await app?.close()
  } finally {
    mock?.kill()
  }
})

test('chat panel connects to the mock gateway and streams a reply', async () => {
  const page = await app.firstWindow()

  await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })

  const input = page.getByPlaceholder('Type a message…')
  await input.fill('ping')
  await input.press('Enter')

  await expect(page.getByText('ping')).toBeVisible()
  await expect(page.getByText('PONG')).toBeVisible({ timeout: 15000 })
})
