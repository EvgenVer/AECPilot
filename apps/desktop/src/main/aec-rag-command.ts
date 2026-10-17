// How the main process starts our `aec-rag` command line (ingest, scan, graph, quotes)
// in both layouts (task T21.2). Mirrors `runtime/hermes-env.mjs::mcpServerCommand`,
// which the core's MCP registration uses: a development checkout runs the uv
// workspace's console script, an installed tree runs `python -s -m aec_rag` with our
// staged interpreter — a console-script exe carries the build machine's absolute path
// to its python, the module form carries nothing.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** `<root>`: the repository in development, the folder the person chose when installed
 *  (`out/main` → four levels up lands on it in both, `resources/app.asar/out/main`). */
export function installRoot(): string {
  return join(__dirname, '../../../../')
}

export function stagedMcpPython(root = installRoot()): string {
  return process.platform === 'win32'
    ? join(root, 'runtime', 'mcp', 'python', 'python.exe')
    : join(root, 'runtime', 'mcp', 'python', 'bin', 'python3')
}

export function aecRagCommand(
  root = installRoot(),
  exists: (file: string) => boolean = existsSync
): string {
  const staged = stagedMcpPython(root)
  if (exists(staged)) return staged
  return process.platform === 'win32'
    ? join(root, '.venv', 'Scripts', 'aec-rag.exe')
    : join(root, '.venv', 'bin', 'aec-rag')
}

/** The arguments to go with {@link aecRagCommand}: the module prefix, then `rest`. */
export function aecRagArgs(
  rest: string[],
  root = installRoot(),
  exists: (file: string) => boolean = existsSync
): string[] {
  return exists(stagedMcpPython(root)) ? ['-s', '-m', 'aec_rag', ...rest] : rest
}
