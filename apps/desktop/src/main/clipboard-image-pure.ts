// The clipboard image as PNG bytes (task T52, Electron 44).
//
// Electron 44 moved its clipboard onto the W3C async API: `readImage()` is gone
// and an image arrives through `clipboard.read()` as a `ClipboardItem` whose
// `getType('image/png')` is a Blob. The same answer their main process gives
// (`apps/desktop/electron/clipboard-image.ts` at v0.23.0), typed for our tree:
// PNG bytes, or null when the clipboard carries no image. The clipboard is
// passed in so tests can drive it without Electron.

const PNG_MIME = 'image/png'

interface ClipboardItemLike {
  types?: readonly string[]
  // Electron types the answer as Blob | ClipboardBookmark; only a Blob has bytes.
  getType(type: string): Promise<unknown>
}

export interface ClipboardReader {
  read(): Promise<readonly ClipboardItemLike[]>
}

export async function readClipboardImagePng(clipboard: ClipboardReader): Promise<Buffer | null> {
  let items: readonly ClipboardItemLike[]

  try {
    items = await clipboard.read()
  } catch {
    // A read can reject while another program is mid-write; the old sync
    // `readImage()` answered an empty image in that case, which meant "no image".
    return null
  }

  for (const item of items) {
    if (!Array.isArray(item?.types) || !item.types.includes(PNG_MIME)) continue

    try {
      const blob = (await item.getType(PNG_MIME)) as {
        arrayBuffer?: () => Promise<ArrayBuffer>
      } | null
      if (!blob || typeof blob.arrayBuffer !== 'function') continue
      const bytes = Buffer.from(await blob.arrayBuffer())
      // An empty payload behaves as "no image", as an empty NativeImage did.
      if (bytes.length > 0) return bytes
    } catch {
      // The type vanished between read() and getType(); keep looking.
    }
  }

  return null
}
