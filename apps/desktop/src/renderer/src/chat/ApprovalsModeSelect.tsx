import { useEffect, useState } from 'react'

type ApprovalMode = 'manual' | 'smart' | 'off'

const MODE_OPTIONS: { value: ApprovalMode; label: string; title: string }[] = [
  { value: 'manual', label: 'ручные', title: 'ручные — одобрять рискованное' },
  { value: 'smart', label: 'смарт', title: 'смарт — LLM решает сам' },
  { value: 'off', label: 'выкл', title: 'выкл — без одобрений' }
]

/** Header control for the hermes profile's approvals mode (task 0.17):
 * reads the current mode once on mount via a main-process `config.yaml`
 * read (no gateway call), and writes changes back the same way — hermes
 * re-reads config.yaml per command, so a change applies live with no serve
 * restart. On a failed write, the select reverts to the previous value and
 * the error is surfaced via `onError`. */
export default function ApprovalsModeSelect({
  disabled,
  onError
}: {
  disabled: boolean
  onError: (message: string) => void
}) {
  const [mode, setMode] = useState<ApprovalMode>('manual')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getApprovalsMode()
      .then((result) => {
        if (mounted) setMode(result.mode)
      })
      .catch((error) => {
        if (mounted) onError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      mounted = false
    }
    // onError is expected to be a stable callback from the parent — this
    // effect should only run once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleChange(next: ApprovalMode): Promise<void> {
    const previous = mode
    setMode(next)
    setSaving(true)
    try {
      const result = await window.aecpilot.setApprovalsMode(next)
      if (!result.ok) {
        setMode(previous)
        onError(result.error ?? 'не удалось применить режим одобрений')
      }
    } catch (error) {
      setMode(previous)
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        color: mode === 'off' ? '#a72' : 'inherit'
      }}
    >
      Одобрения:
      <select
        value={mode}
        onChange={(event) => void handleChange(event.target.value as ApprovalMode)}
        disabled={disabled || saving}
        style={{
          font: 'inherit',
          fontSize: 12,
          padding: '2px 4px',
          color: mode === 'off' ? '#a72' : 'inherit'
        }}
      >
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} title={option.title}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
