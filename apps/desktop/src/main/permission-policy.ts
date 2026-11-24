// Permission policy for every session that shows pages: the window's default session
// and each preview jar (task T88, review of the 0.23.3 donor port). Without a handler
// Electron grants every permission a page asks for, so a jar the policy never reached
// would hand geolocation, notifications or the camera to any site the agent opens.
// Which permissions pass is decided in `media-permission-pure.ts`.

import type { Session, WebContents } from 'electron'

import { isAllowedPermission } from './media-permission-pure'

const covered = new WeakSet<Session>()

// The microphone (UR49, task T59): one window, a few seconds, for one press of a person.
// Main hands it out after checking the press and that dictation is on (`index.ts`); a page
// in the preview, another window or a script of the same window a minute later has none.
const MICROPHONE_GRANT_MS = 10_000
const microphoneUntil = new WeakMap<WebContents, number>()

/** Lets `contents` open the microphone for the next few seconds. */
export function grantMicrophone(contents: WebContents, now = Date.now()): void {
  microphoneUntil.set(contents, now + MICROPHONE_GRANT_MS)
}

function microphoneGranted(
  contents: WebContents | null,
  isMainFrame: boolean | undefined
): boolean {
  return !!contents && isMainFrame !== false && (microphoneUntil.get(contents) ?? 0) > Date.now()
}

/** Installs the permission handlers on `ses` once; later calls for the same session do nothing. */
export function applyPermissionPolicy(ses: Session): void {
  if (covered.has(ses)) return
  covered.add(ses)

  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const kinds = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    const granted = microphoneGranted(contents, details.isMainFrame)
    const allowed = isAllowedPermission(permission, kinds, granted)
    // One press, one stream.
    if (permission === 'media' && granted) microphoneUntil.delete(contents)
    callback(allowed)
  })

  ses.setPermissionCheckHandler((contents, permission, _origin, details) => {
    const kind = details.mediaType
    return isAllowedPermission(
      permission,
      kind && kind !== 'unknown' ? [kind] : [],
      microphoneGranted(contents, details.isMainFrame)
    )
  })
}
