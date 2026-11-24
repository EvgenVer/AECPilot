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
 * `media` — микрофон и камера — по умолчанию отказ (задача 3H.3, HX19). Единственное
 * исключение — локальная диктовка (UR49, задача T59): ровно микрофон, без камеры, и
 * только пока у ЭТОГО окна действует разрешение, выданное нажатием человека
 * (`microphoneGranted`, `permission-policy.ts`). Виды не объявлены — отказ: диктовка
 * всегда называет звук, а камера не нужна ничему.
 */
export function isAllowedPermission(
  permission: string,
  mediaKinds: readonly string[] = [],
  microphoneGranted = false
): boolean {
  if (ALLOWED_PERMISSIONS.includes(permission)) return true
  return (
    permission === 'media' &&
    microphoneGranted &&
    mediaKinds.length > 0 &&
    mediaKinds.every((kind) => kind === 'audio')
  )
}
