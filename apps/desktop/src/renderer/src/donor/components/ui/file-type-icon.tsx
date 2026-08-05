/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/file-type-icon.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { ToolIcon, type ToolIconProps } from '@/components/ui/tool-icon'
import { codiconForFilename, codiconForLanguage } from '@/lib/markdown-code'

export interface FileTypeIconProps extends Omit<ToolIconProps, 'name'> {
  /** A code-fence language tag (e.g. `ts`, `json`). Used when no `path`. */
  language?: string
  /** A file path or bare name; its extension selects the icon. Wins over `language`. */
  path?: string
}

/**
 * Icon for a file or code language, resolved through the one mapping shared
 * with code blocks (`codiconForFilename` / `codiconForLanguage`). Renders via
 * `ToolIcon`, so it uses a filled glyph when one exists and falls back to the
 * outline codicon font otherwise. Pass a `path` for file rows or a `language`
 * for fenced code.
 */
export function FileTypeIcon({ language, path, ...props }: FileTypeIconProps) {
  const name = path ? codiconForFilename(path) : codiconForLanguage(language)

  return <ToolIcon name={name} {...props} />
}
