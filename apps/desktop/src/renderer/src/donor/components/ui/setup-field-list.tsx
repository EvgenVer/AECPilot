/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/setup-field-list.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Field, FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'

export interface SetupField {
  name: string
  prompt?: string
  required: boolean
  secret: boolean
  default: string
}

interface SetupFieldListProps {
  fields: SetupField[]
  draft: Record<string, string>
  onChange: (name: string, value: string) => void
  disabled?: boolean
}

export function SetupFieldList({ disabled, draft, fields, onChange }: SetupFieldListProps) {
  const { t } = useI18n()

  return (
    <div className="grid gap-4">
      {fields.map(field => {
        const id = `setup-field-${field.name}`

        return (
          <Field htmlFor={id} key={field.name} label={field.prompt || field.name}>
            <Input
              disabled={disabled}
              id={id}
              onChange={event => onChange(field.name, event.currentTarget.value)}
              type={field.secret ? 'password' : 'text'}
              value={draft[field.name] ?? ''}
            />
            {field.required ? <FieldHint>{t.connectors.required}</FieldHint> : null}
          </Field>
        )
      })}
    </div>
  )
}
