// Where an installed tree keeps what Electron and every process of ours write (tasks
// T39, T41; UR40): under the folder the person chose, never in `%APPDATA%`, `%TEMP%`,
// `~/.cache` or `%APPDATA%\npm`. A working copy (its `.git` is the proof, as in
// `runtime/hermes-env.mjs::IS_WORKING_COPY`) keeps the person's defaults.

import { delimiter, join, resolve } from 'node:path'

export interface DataRootInput {
  /** `<root>`: the folder the person installed into, or the repository. */
  root: string
  exists: (file: string) => boolean
}

/** `<root>/data` of an installed tree, or `null` for a working copy / a bare tree. */
export function installedDataDir({ root, exists }: DataRootInput): string | null {
  if (exists(join(root, '.git'))) return null
  // The core payload's manifest is the proof of an installed tree (hermes-env.mjs).
  if (!exists(join(root, 'runtime', 'core', 'manifest.json'))) return null
  return join(root, 'data')
}

/** The `userData` folder to set before `ready`, or `null` to leave Electron's default.
 *  An explicit `--user-data-dir` (the e2e stand) always wins. */
export function installedUserData(dataDir: string | null, userDataSwitch: boolean): string | null {
  return dataDir && !userDataSwitch ? join(dataDir, 'userData') : null
}

/**
 * The environment every child inherits from the main process (task T41): the core,
 * the agent's terminal, our MCP servers and `aec-rag` runs all spread `process.env`.
 * The agent's `npm install -g` lands in `npm_config_prefix` (measured 2026-10-17,
 * T21.2: without it, in the npm of a foreign Hermes install), so that folder also goes
 * to the END of PATH — what the agent installs it can run, shadowing nothing.
 *
 * Not `PYTHONPYCACHEPREFIX`: the core payload's bytecode is baked
 * (`.hermes-baked-pycache`) and a prefix would relocate the READS too, making every
 * import a cold compile (their `scripts/build/launcher_wrapper.py`); with the marker
 * their launcher sets none either. Our MCP Python's bytecode is baked too (T23).
 */
export function installedDataEnv(dataDir: string, env: NodeJS.ProcessEnv): Record<string, string> {
  const cache = join(dataDir, 'cache')
  const tmp = join(dataDir, 'tmp')
  const npmPrefix = join(dataDir, 'npm')
  // Windows keeps the key as `Path`; reuse whatever spelling is there.
  const pathKey = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH'
  const entries = (env[pathKey] ?? '').split(delimiter).filter(Boolean)
  const listed = entries.some((entry) => resolve(entry).toLowerCase() === npmPrefix.toLowerCase())
  return {
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
    XDG_CACHE_HOME: cache,
    HF_HOME: join(cache, 'huggingface'),
    npm_config_prefix: npmPrefix,
    npm_config_cache: join(cache, 'npm'),
    [pathKey]: (listed ? entries : [...entries, npmPrefix]).join(delimiter)
  }
}

/** The folders of {@link installedDataEnv} to create up front: a missing TEMP breaks
 *  programs. */
export function dataEnvDirs(dataEnv: Record<string, string>): string[] {
  return [dataEnv.TEMP, dataEnv.XDG_CACHE_HOME, dataEnv.npm_config_prefix]
}
