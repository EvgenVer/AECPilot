/**
 * Ported from Hermes Desktop (decision 0017: tickets for the core's single gateway).
 * Source:  apps/desktop/electron/local-gateway-python.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (shipped in THIRD-PARTY-NOTICES.txt with the core)
 * Main-process code, not the donor zone.
 * Edits:
 *   - the interpreter is ours: the core payload's CPython with `runtime/bin/core_python.py`
 *     (or the dev venv's), passed in as `command` + `args`, so `ticketRuntimeFor` and the
 *     launcher probe (`--print-runtime-command`) are dropped;
 *   - `hiddenWindowsChildOptions` → `windowsHide: true`;
 *   - TICKET_SCRIPT is verbatim; the bridge keeps their limits (64 KiB lines, 10 s per
 *     ticket, 30 s idle).
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import type { GatewayEndpoint, GatewayTicketPurpose } from './local-gateway'

// Reuse the runtime's bounded control client: Windows pipe server PID/SID validation has one
// canonical implementation (hermes_cli.gateway_client._session_ticket).
export const TICKET_SCRIPT = `
import json, os, sys
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
with redirect_stdout(sys.stderr):
    from hermes_cli.gateway_client import _session_ticket
    from hermes_cli.gateway_runtime_discovery import DiscoveryError, _private_node
while True:
    line = sys.stdin.buffer.readline(65537)
    if not line:
        break
    if len(line) > 65536 or not line.endswith(b'\\n'):
        break
    request = json.loads(line)
    try:
        with redirect_stdout(sys.stderr):
            endpoint = SimpleNamespace(**{'control_home': None, **request['endpoint']})
            home = Path(endpoint.profile_id)
            if str(home.resolve()) != endpoint.profile_id or endpoint.runtime_protocol != 1:
                raise ValueError('invalid ticket endpoint')
            if os.name != 'nt':
                _private_node(home, kind='directory', home=True)
            ticket = _session_ticket(home, endpoint, purpose=request['purpose'],
                                     scope='host' if request['purpose'] == 'interactive' else None)
        reply = {'id': request['id'], 'ticket': ticket}
    except DiscoveryError as exc:
        reply = {'id': request['id'], 'error': exc.reason}
    except Exception:
        reply = {'id': request['id'], 'error': 'ticket_failed'}
    print(json.dumps(reply), flush=True)
`

/** How to start the core's interpreter: `<command> <args...> -c <script>`. */
export interface TicketRuntime {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

interface PendingTicket {
  resolve: (ticket: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** One private helper per runtime/profile; every ticket still verifies the live owner. */
class TicketBridge {
  private child: ChildProcessWithoutNullStreams
  private pending = new Map<number, PendingTicket>()
  private sequence = 0
  private output = ''
  private idleTimer?: ReturnType<typeof setTimeout>
  private closed = false

  constructor(
    runtime: TicketRuntime,
    env: NodeJS.ProcessEnv,
    private key: string,
    private onDispose: (bridge: TicketBridge) => void
  ) {
    this.child = spawn(runtime.command, ['-u', ...runtime.args, '-c', TICKET_SCRIPT], {
      cwd: runtime.cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child.stderr.resume()
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (data) => this.receive(String(data)))
    this.child.on('error', () => this.dispose())
    this.child.stdin.on('error', () => this.dispose())
    this.child.on('close', () => this.dispose())
  }

  get id(): string {
    return this.key
  }

  request(endpoint: GatewayEndpoint, purpose: GatewayTicketPurpose): Promise<string> {
    clearTimeout(this.idleTimer)

    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('Gateway ticket bootstrap failed'))
        return
      }

      const id = ++this.sequence
      const { profile_id, instance_id, runtime_protocol, control_home } = endpoint
      const request =
        JSON.stringify({
          id,
          endpoint: { profile_id, instance_id, runtime_protocol, control_home },
          purpose
        }) + '\n'

      if (Buffer.byteLength(request) > 65536) {
        reject(new Error('Gateway ticket request too large'))
        return
      }

      const timer = setTimeout(() => this.dispose(), 10_000)
      this.pending.set(id, { resolve, reject, timer })
      // Private stdin carries identity as data. EOF also retires the helper if the app exits.
      this.child.stdin.write(request)
    })
  }

  private receive(data: string): void {
    this.output += data

    if (this.output.length > 65536) {
      this.dispose()
      return
    }

    let end: number

    while ((end = this.output.indexOf('\n')) >= 0) {
      const line = this.output.slice(0, end)
      this.output = this.output.slice(end + 1)

      try {
        const reply = JSON.parse(line)
        const waiter = this.pending.get(reply.id)

        if (!waiter) {
          this.dispose()
          return
        }

        this.pending.delete(reply.id)
        clearTimeout(waiter.timer)

        if (typeof reply.ticket === 'string' && reply.ticket) {
          waiter.resolve(reply.ticket)
        } else {
          waiter.reject(
            Object.assign(
              new Error('Gateway ticket bootstrap failed'),
              typeof reply.error === 'string' ? { reason: reply.error } : {}
            )
          )
        }
      } catch {
        this.dispose()
        return
      }
    }

    if (!this.pending.size) {
      this.idleTimer = setTimeout(() => this.dispose(), 30_000)
    }
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.idleTimer)
    this.onDispose(this)

    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Gateway ticket bootstrap failed'))
    }

    this.pending.clear()
    this.child.kill('SIGKILL')
  }
}

const bridges = new Map<string, TicketBridge>()

/** Retires every helper (the gateway stopped, the app is quitting). */
export function closeGatewayTicketBridges(): void {
  for (const bridge of [...bridges.values()]) bridge.dispose()
}

/** A one-use ticket for `endpoint`, minted by the core's own client over the named pipe. */
export function mintGatewayTicketWithPython(
  runtime: TicketRuntime,
  endpoint: GatewayEndpoint,
  purpose: GatewayTicketPurpose
): Promise<string> {
  const env = {
    ...runtime.env,
    HERMES_HOME: endpoint.profile_id,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  }
  const key = JSON.stringify([runtime.command, runtime.cwd, endpoint.profile_id])
  let bridge = bridges.get(key)

  if (!bridge) {
    bridge = new TicketBridge(runtime, env, key, (gone) => {
      if (bridges.get(gone.id) === gone) bridges.delete(gone.id)
    })
    bridges.set(key, bridge)
  }

  return bridge.request(endpoint, purpose)
}
