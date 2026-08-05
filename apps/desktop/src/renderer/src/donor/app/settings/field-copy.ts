/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/field-copy.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface FieldCopyTree {
  [key: string]: string | FieldCopyTree
}

function schemaSegmentToFieldCopySegment(segment: string): string {
  return segment.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

function isFieldCopyTree(value: unknown): value is FieldCopyTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function schemaKeyToFieldCopyKey(schemaKey: string): string {
  return schemaKey.split('.').map(schemaSegmentToFieldCopySegment).join('.')
}

export function fieldCopyForSchemaKey(copy: Record<string, string>, schemaKey: string): string | undefined {
  return copy[schemaKeyToFieldCopyKey(schemaKey)] ?? copy[schemaKey]
}

export function defineFieldCopy(copy: FieldCopyTree): Record<string, string> {
  const result: Record<string, string> = {}

  const visit = (node: FieldCopyTree, prefix: string[] = []) => {
    for (const [key, value] of Object.entries(node)) {
      const parts = key.split('.')

      if (parts.some(part => part.length === 0)) {
        throw new Error(`Invalid field copy key: ${[...prefix, key].join('.')}`)
      }

      const path = [...prefix, ...parts]

      if (typeof value === 'string') {
        const flatKey = path.join('.')

        if (Object.prototype.hasOwnProperty.call(result, flatKey)) {
          throw new Error(`Duplicate field copy key: ${flatKey}`)
        }

        result[flatKey] = value

        continue
      }

      if (!isFieldCopyTree(value)) {
        throw new Error(`Invalid field copy value for key: ${path.join('.')}`)
      }

      visit(value, path)
    }
  }

  visit(copy)

  return result
}
