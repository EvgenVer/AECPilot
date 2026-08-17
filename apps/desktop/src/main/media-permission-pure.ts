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

/** Media kinds this product captures. Video is deliberately absent: nothing in
 * the app reads a camera, so a request for one is a bug or an attack. */
const ALLOWED_MEDIA_KINDS = ['audio']

/** Granted regardless of media kind.
 *
 * `clipboard-sanitized-write` is the async clipboard write behind the mermaid
 * diagram's "copy as PNG" (`donor/lib/svg-image.ts`) — an outbound copy the
 * user clicks, which reads nothing back. Their text copy does not need it: the
 * clipboard shim routes `writeText` through main. */
const ALLOWED_PERMISSIONS = ['clipboard-sanitized-write']

/**
 * `mediaKinds` is what the caller was told the page wants — `['audio']` for
 * `getUserMedia({audio: true})`.
 *
 * An EMPTY list is treated as audio, not as "unknown, deny": Chromium does not
 * always populate the kinds (the check handler reports `'unknown'` on some
 * paths, and the field is optional in Electron's own types), and a microphone
 * that dies on a shape difference would be a silent regression. Denying video
 * is what this rule is actually for, and video always names itself. The
 * guarantee UR21 makes — the mic opens only on an explicit action — is carried
 * by the code path (`getUserMedia` is reached from the record button and from
 * barge-in during a voice conversation, nowhere else), not by this answer.
 */
export function isAllowedPermission(
  permission: string,
  mediaKinds: readonly string[] = []
): boolean {
  if (ALLOWED_PERMISSIONS.includes(permission)) return true
  if (permission !== 'media') return false
  return mediaKinds.every((kind) => ALLOWED_MEDIA_KINDS.includes(kind))
}

/** Their `requestMicrophoneAccess()` contract: `false` means "the OS will not
 * give us the microphone", and the donor's recorder turns that into a readable
 * "microphone access denied" instead of letting `getUserMedia` throw a
 * `NotAllowedError` at the user.
 *
 * Only macOS has a prompt API (`askForMediaAccess`), and it is asynchronous —
 * hence the caller passing its result in rather than this deciding. On Windows
 * `getMediaAccessStatus` reflects the OS privacy switch; on Linux it is not
 * implemented and the status arrives as `'unknown'`, which must not read as a
 * refusal. */
export function decideMicrophoneAccess(status: string): boolean {
  return status !== 'denied' && status !== 'restricted'
}
