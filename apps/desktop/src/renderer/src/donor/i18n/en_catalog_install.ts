/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_catalog_install.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CatalogInstallTranslations } from './types_catalog_install'

export const enCatalogInstall: CatalogInstallTranslations = {
  preparing: 'Preparing the install…',
  install: 'Install',
  advanced: 'Advanced',
  skip: 'Skip',
  installing: 'Installing…',
  installed: 'Installed',
  notInstalled: 'Not installed',
  failed: 'Failed',
  showNames: 'show names',
  hideNames: 'hide names',
  skill: name => `skill ${name}`,
  kind: { plugin: 'plugin', skill: 'skill' },
  tier: { official: 'official', verified: 'verified', community: 'community' },
  targetProfile: profile => `Installs into your ${profile} profile`,
  sendFailed: 'Could not send your answer. Try again.',
  commitLabel: 'Commit',
  subdirLabel: 'Folder',
  securityHeading: 'Security',
  scan: { passed: 'Scan passed', warnings: 'Scan found warnings', failed: 'Scan failed' },
  requirementsLabel: 'Requires',
  requiresHermes: range => `Hermes ${range}`,
  envVar: name => `${name} environment variable`,
  credentialsHeading: 'Credentials',
  phase: {
    downloading: 'Downloading…',
    python_packages: 'Installing Python packages…',
    loading_tools: 'Loading its tools…'
  },
  serverNotConnected: (server, reason) => `MCP server ${server} not connected${reason ? `: ${reason}` : ''}`,
  notEnabled: 'Installed but not turned on',
  missingEnv: names => `Set ${names} to finish setup`,
  alreadyInstalled: 'Already installed; left as it is'
}
