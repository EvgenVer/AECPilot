// Which permission requests from the renderer main answers "yes" to, and what
// "the microphone is available" means per platform (task 3.7a).
//
// Until this file existed the app installed no permission handler at all, and
// Electron's default is to grant whatever a page asks for. The microphone
// worked by that default — and so would geolocation, MIDI, screen capture and
// window management, none of which this product has any use for. SPEC UR21
// says the microphone opens only on an explicit action; "everything is
// granted, we just never ask" is not a statement anyone can check.
//
// Pure because Electron asks the same question through two callbacks in two
// shapes — `setPermissionRequestHandler` carries `mediaTypes: string[]`,
// `setPermissionCheckHandler` a single `mediaType` — and a policy written
// twice is a policy that drifts.

/** Granted regardless of media kind.
 *
 * `clipboard-sanitized-write` is the async clipboard write behind the mermaid
 * diagram's "copy as PNG" (`donor/lib/svg-image.ts`) — an outbound copy the
 * user clicks, which reads nothing back. Their text copy does not need it: the
 * clipboard shim routes `writeText` through main. */
const ALLOWED_PERMISSIONS = ['clipboard-sanitized-write']

/**
 * `media` — микрофон и камера — запрещено ЦЕЛИКОМ (задача 3H.3). Микрофон был
 * разрешён ради голосового режима (задача 3.7a, UR21); голос вне продукта
 * (SPEC HX19, решение владельца 2026-10-07), и снимать с окна микрофон, оставив
 * разрешение на него, значит держать дверь, которой никто не пользуется.
 * `mediaKinds` остаётся в подписи: оба обработчика Electron его передают.
 */
export function isAllowedPermission(
  permission: string,
  _mediaKinds: readonly string[] = []
): boolean {
  return ALLOWED_PERMISSIONS.includes(permission)
}
