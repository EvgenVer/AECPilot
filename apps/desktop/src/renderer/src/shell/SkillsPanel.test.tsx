// Tasks 1.6.B3.3–B3.9, B3.13 — the skills section. Contract:
// specs/agent-skills.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import SkillsPanel from './SkillsPanel'

const listSkills = vi.fn()
const reloadSkills = vi.fn()
const getLearningNode = vi.fn()
const editLearningNode = vi.fn()
const deleteLearningNode = vi.fn()
const getCuratorStatus = vi.fn()
const dispatchLearn = vi.fn()
const submitPrompt = vi.fn()

/** The archive button of a named skill's own row. The list is sorted
 * alphabetically, so positional lookup would silently target another skill. */
function archiveButton(skillName: string): HTMLElement {
  const row = screen.getByText(skillName).closest('li')
  if (!row) throw new Error(`no row for ${skillName}`)
  return within(row as HTMLElement).getByRole('button', { name: 'В архив' })
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, next: string): void {
  const proto =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, next)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  listSkills.mockResolvedValue([
    { name: 'sources-management', description: 'работа с источниками', category: 'general' },
    { name: 'off-skill', description: '', category: 'general', enabled: false }
  ])
  reloadSkills.mockResolvedValue({ added: ['new-one'], removed: [], total: 3 })
  getLearningNode.mockResolvedValue({ ok: true, kind: 'skill', content: '# Skill\nтело' })
  editLearningNode.mockResolvedValue({ ok: true })
  deleteLearningNode.mockResolvedValue({ ok: true, message: "archived 'x'" })
  getCuratorStatus.mockResolvedValue({ enabled: true, archive_after_days: 90 })
  dispatchLearn.mockResolvedValue({ type: 'send', message: '/learn тема' })
  submitPrompt.mockResolvedValue(undefined)
  window.aecpilot = {
    listSkills,
    reloadSkills,
    getLearningNode,
    editLearningNode,
    deleteLearningNode,
    getCuratorStatus,
    dispatchLearn,
    submitPrompt
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SkillsPanel', () => {
  it('lists skills by category with a count', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    expect(screen.getByText('general')).toBeTruthy()
    expect(screen.getByText('Скилов: 2')).toBeTruthy()
  })

  it('shows a disabled skill as disabled and offers no toggle', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('выключен')).toBeTruthy())
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('explains an empty list instead of showing a blank block', async () => {
    listSkills.mockResolvedValue([])
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText(/SKILL\.md/)).toBeTruthy())
  })

  // The first sentence is true whatever the status says, so it must not
  // depend on the status arriving.
  it('shows the curator plate even when the status call fails', async () => {
    getCuratorStatus.mockRejectedValue(new Error('nope'))
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText(/автоархивации/)).toBeTruthy())
  })

  it('names the actual thresholds when the status arrived', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText(/90 дн/)).toBeTruthy())
  })

  it('reports what a reload changed', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Перечитать скилы' }).click()
    })
    await waitFor(() => expect(screen.getByText(/добавлено: new-one/)).toBeTruthy())
  })

  it('opens SKILL.md on demand', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'sources-management' }).click()
    })
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Содержимое скила sources-management') as HTMLTextAreaElement).value
      ).toContain('тело')
    )
  })

  // Their mutations answer {ok:false} as a SUCCESSFUL result, so the UI has to
  // read `ok` rather than trust the absence of an error.
  it('shows the gateway message instead of an empty body when detail fails', async () => {
    getLearningNode.mockResolvedValue({ ok: false, message: "skill 'x' not found" })
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'sources-management' }).click()
    })
    await waitFor(() => expect(screen.getByText("skill 'x' not found")).toBeTruthy())
    expect(screen.queryByLabelText('Содержимое скила sources-management')).toBeNull()
  })

  it('confirms before overwriting SKILL.md and sends confirmed: true', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'sources-management' }).click()
    })
    const editor = await screen.findByLabelText('Содержимое скила sources-management')
    await act(async () => {
      setInputValue(editor as HTMLTextAreaElement, 'новое тело')
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click()
    })
    expect(editLearningNode).not.toHaveBeenCalled()
    await act(async () => {
      screen.getByRole('button', { name: 'Перезаписать' }).click()
    })
    expect(editLearningNode).toHaveBeenCalledWith({
      id: 'sources-management',
      content: 'новое тело',
      confirmed: true
    })
  })

  // Losing the user's text because the core refused it is the worse failure.
  it('keeps the draft when the core refuses the edit', async () => {
    editLearningNode.mockResolvedValue({ ok: false, message: 'edit failed' })
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'sources-management' }).click()
    })
    const editor = await screen.findByLabelText('Содержимое скила sources-management')
    await act(async () => {
      setInputValue(editor as HTMLTextAreaElement, 'мой текст')
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Перезаписать' }).click()
    })
    await waitFor(() => expect(screen.getByText('edit failed')).toBeTruthy())
    expect(
      (screen.getByLabelText('Содержимое скила sources-management') as HTMLTextAreaElement).value
    ).toBe('мой текст')
  })

  it('names the restore command when archiving a skill', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      archiveButton('sources-management').click()
    })
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('hermes curator restore sources-management')
    await act(async () => {
      screen.getByRole('button', { name: 'Убрать' }).click()
    })
    expect(deleteLearningNode).toHaveBeenCalledWith({
      id: 'sources-management',
      confirmed: true
    })
  })

  it('shows the pinned refusal as-is and leaves the list alone', async () => {
    deleteLearningNode.mockResolvedValue({
      ok: false,
      message: "'sources-management' is pinned — unpin it first"
    })
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      archiveButton('sources-management').click()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Убрать' }).click()
    })
    await waitFor(() => expect(screen.getByText(/is pinned/)).toBeTruthy())
    expect(screen.getByText('sources-management')).toBeTruthy()
  })

  it('sends a /learn turn through the same channel as the composer', async () => {
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      setInputValue(screen.getByLabelText('Тема обучения') as HTMLInputElement, 'работа с DWG')
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Научить' }).click()
    })
    expect(dispatchLearn).toHaveBeenCalledWith('работа с DWG')
    expect(submitPrompt).toHaveBeenCalledWith('/learn тема')
  })

  // Quietly submitting an unexpected shape as a user turn is the failure to
  // avoid.
  it('sends nothing when the dispatch answers with another type', async () => {
    dispatchLearn.mockResolvedValue({ type: 'exec', output: 'что-то' })
    render(<SkillsPanel />)
    await waitFor(() => expect(screen.getByText('sources-management')).toBeTruthy())
    await act(async () => {
      setInputValue(screen.getByLabelText('Тема обучения') as HTMLInputElement, 'тема')
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Научить' }).click()
    })
    expect(submitPrompt).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/вместо «send»/)).toBeTruthy())
  })
})
