import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MarkdownTextContent } from './markdown-text'

/**
 * Covers specs/agent-chat.md "Ответ агента рендерится как markdown": the
 * markup must arrive as elements, and its source characters (`**`, `#`,
 * backticks) must not be shown to the reader. The assertions are on the
 * rendered TREE, not on class names — the styling is repainted by task
 * 1.6.10 and must be free to change without rewriting these tests.
 */

afterEach(cleanup)

function renderMarkdown(text: string, isRunning = false): HTMLElement {
  const { container } = render(<MarkdownTextContent isRunning={isRunning} text={text} />)
  return container
}

/** Bold is NOT a `<strong>` here: streamdown renders it as
 * `<span data-streamdown="strong">` (measured). Both are accepted so the test
 * survives them switching back to the semantic tag — what it pins down is
 * "the emphasis is an element our stylesheet can bold", which is exactly what
 * shell.css keys on. */
function boldOf(container: HTMLElement): Element | null {
  return container.querySelector('strong, [data-streamdown="strong"]')
}

test('заголовки, выделение и списки приходят разметкой, а не символами', async () => {
  const container = renderMarkdown(
    ['# Отчёт', '', 'Это **важно** и *курсив*.', '', '- первый', '- второй', ''].join('\n')
  )

  await waitFor(() => expect(container.querySelector('h1')).not.toBeNull())
  expect(container.querySelector('h1')?.textContent).toBe('Отчёт')
  expect(boldOf(container)?.textContent).toBe('важно')
  expect(container.querySelector('em')?.textContent).toBe('курсив')
  expect(container.querySelectorAll('li')).toHaveLength(2)

  // Служебные символы не бросаются в глаза — их вообще нет в тексте.
  const shown = container.textContent ?? ''
  expect(shown).not.toContain('**')
  expect(shown).not.toContain('# ')
})

test('блок кода рендерится блоком кода, без обратных кавычек в тексте', async () => {
  const container = renderMarkdown(['```python', 'x = 1', '```', ''].join('\n'))

  await waitFor(() => expect(container.querySelector('pre')).not.toBeNull())
  expect(container.querySelector('pre')?.textContent).toContain('x = 1')
  expect(container.textContent ?? '').not.toContain('```')
})

test('инлайновый код остаётся инлайновым', async () => {
  const container = renderMarkdown('запусти `pnpm test` и жди')

  await waitFor(() => expect(container.querySelector('code')).not.toBeNull())
  expect(container.querySelector('code')?.textContent).toBe('pnpm test')
  expect(container.querySelector('pre')).toBeNull()
})

test('клик по ссылке уходит в системный браузер, а не в окно приложения', async () => {
  const openExternalLink = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('aecpilot', { openExternalLink })

  const container = renderMarkdown('см. [спеку](https://example.com/spec)')
  await waitFor(() => expect(screen.queryByText('спеку')).not.toBeNull())

  const link = container.querySelector('a')
  expect(link?.getAttribute('href')).toBe('https://example.com/spec')

  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  link?.dispatchEvent(event)

  // Переход отменён — окно рендерера с его preload-API никуда не уходит
  // (вторая линия обороны — guard'ы окна в main, задача 1.6.4a).
  expect(event.defaultPrevented).toBe(true)
  expect(openExternalLink).toHaveBeenCalledWith('https://example.com/spec')

  vi.unstubAllGlobals()
})

test('недописанная разметка на стриме не показывает сырые символы', async () => {
  // Хвост потока: жирный маркер уже открыт, но ещё не закрыт. Стримовый
  // режим примитива достраивает такой хвост, а не печатает `**`.
  const container = renderMarkdown('Готово: **важн', true)

  await waitFor(() => expect(container.textContent).toContain('важн'))
  expect(container.textContent ?? '').not.toContain('**')
  expect(boldOf(container)?.textContent).toBe('важн')
})

test('таблица едет в своём контейнере с прокруткой', async () => {
  const container = renderMarkdown(
    ['| колонка | значение |', '| --- | --- |', '| a | 1 |', ''].join('\n')
  )

  await waitFor(() => expect(container.querySelector('table')).not.toBeNull())
  expect(container.querySelector('.chat-markdown__table table')).not.toBeNull()
  expect(container.querySelectorAll('td')).toHaveLength(2)
})
