// Permission policy for every session that shows pages: the window's default session
// and each preview jar (task T88, review of the 0.23.3 donor port). Without a handler
// Electron grants every permission a page asks for, so a jar the policy never reached
// would hand geolocation, notifications or the camera to any site the agent opens.
// Which permissions pass is decided in `media-permission-pure.ts`.

import type { Session } from 'electron'

import { isAllowedPermission } from './media-permission-pure'

const covered = new WeakSet<Session>()

/** Installs the permission handlers on `ses` once; later calls for the same session do nothing. */
export function applyPermissionPolicy(ses: Session): void {
  if (covered.has(ses)) return
  covered.add(ses)

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const kinds = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(isAllowedPermission(permission, kinds))
  })

  ses.setPermissionCheckHandler((_contents, permission, _origin, details) => {
    const kind = details.mediaType
    return isAllowedPermission(permission, kind && kind !== 'unknown' ? [kind] : [])
  })
}
