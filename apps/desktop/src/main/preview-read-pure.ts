// Дефект D-127: текстовый файл в их панели предпросмотра не открывался вовсе —
// «window.hermesDesktop.readFileText is not bridged in AECPilot». Член числился
// в непроброшенных как член их загрузчика плагинов (SPEC HX5), но его же зовёт
// их просмотр файла (`preview-file.tsx` → `lib/desktop-fs.ts`), а эту
// поверхность мы взяли.
//
// Кому можно читать — то же правило, что у слежения и записи
// (`preview-watch-pure.ts`): файл внутри открытого проекта либо выбранный
// человеком в нашем диалоге. Здесь — только разбор байтов, без диска.

/** D-208: их дерево файлов проекта в правой панели читает папку `readDir`.
 *  Шум, который их главный процесс не показывает никогда
 *  (`electron/fs-read-dir.ts`, `FS_READDIR_HIDDEN`). */
const DIR_HIDDEN = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'dist',
  'node_modules',
  'target',
  'venv'
])

export interface DirEntry {
  isDirectory: boolean
  name: string
  path: string
}

/** Как у них: без шума, сначала папки, внутри групп — по имени. */
export function visibleDirEntries(entries: DirEntry[]): DirEntry[] {
  return entries
    .filter((entry) => !DIR_HIDDEN.has(entry.name))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
}

/** Их предел превью: больше — показывается начало и признак `truncated`, а
 *  редактор такой файл не открывает (сохранение потеряло бы хвост). */
export const PREVIEW_TEXT_MAX_BYTES = 512 * 1024

export interface PreviewText {
  binary: boolean
  byteSize: number
  text: string
  truncated: boolean
}

/** Разобрать прочитанное начало файла. `byteSize` — размер файла целиком, а
 *  `head` — не больше `PREVIEW_TEXT_MAX_BYTES` его первых байтов. */
export function decodePreviewText(head: Uint8Array, byteSize: number): PreviewText {
  // Нулевой байт в тексте не встречается — это их же признак двоичного файла.
  const binary = head.includes(0)
  return {
    binary,
    byteSize,
    text: binary ? '' : new TextDecoder().decode(head),
    truncated: byteSize > head.byteLength
  }
}
