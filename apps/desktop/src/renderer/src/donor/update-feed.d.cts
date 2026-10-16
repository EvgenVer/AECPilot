/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/update-feed.d.cts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
interface DarwinFeed {
  /** Feed directory key under the public bucket, no trailing slash.
   *  e.g. "releases/darwin/stable" | "releases/darwin/light/canary" */
  directory: string
  /** Validated slug; existence is resolved through R2. */
  channel: string
  /** electron-updater manifest filename. e.g. "stable-mac.yml" */
  fileName: string
  /** Legacy nonstable feeds admit prereleases. */
  allowPrerelease: boolean
}

/**
 * Feed layout contract shared by the desktop runtime and the release
 * pipeline. `light` selects the Light-variant feed directory.
 * The generic-provider feed URL is PUBLIC_URL + '/' + directory + '/' + fileName.
 */
declare function darwinFeed(channel: string, light?: boolean): DarwinFeed

/** Validate and canonicalize the public updater feed base URL. */
declare function feedBaseUrl(raw: string | undefined): string | undefined

declare const contract: {
  darwinFeed: typeof darwinFeed
  feedBaseUrl: typeof feedBaseUrl
}
export = contract
