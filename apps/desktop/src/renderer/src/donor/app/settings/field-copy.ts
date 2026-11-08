/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/field-copy.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
