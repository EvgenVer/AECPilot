/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/ssh-host-selection.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
type SshHostState = {
  sshHost: string
  sshUser: string
  sshPort: number | null
  sshKeyPath: string
  sshRemoteHermesPath: string
}

type ResolvedSshHost = {
  identityFile?: string | null
  port?: number | null
  user?: string | null
}

function selectSshHost<T extends SshHostState>(state: T, host: string): T {
  if (host === state.sshHost) {
    return state
  }

  return {
    ...state,
    sshHost: host,
    sshUser: '',
    sshPort: null,
    sshKeyPath: '',
    sshRemoteHermesPath: ''
  }
}

function enrichSelectedSshHost<T extends SshHostState>(state: T, host: string, resolved: ResolvedSshHost): T {
  if (state.sshHost !== host) {
    return state
  }

  return {
    ...state,
    sshUser: state.sshUser || resolved.user || '',
    sshPort: state.sshPort ?? (resolved.port === 22 ? null : (resolved.port ?? null)),
    sshKeyPath: state.sshKeyPath || resolved.identityFile || ''
  }
}

export { enrichSelectedSshHost, selectSshHost }
