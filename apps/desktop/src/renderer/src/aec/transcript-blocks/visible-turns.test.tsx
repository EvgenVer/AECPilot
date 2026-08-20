// Задача 3.4в (SPEC AC13, риск R19). Проверяется не «наш блок отправляет
// сообщение», а «скрытого хода не остаётся ни у кого»: канал у донора один на
// все живые блоки, и обойти его должен быть не в состоянии ни их `::preview`,
// ни наш блок, ни будущий чужой.
//
// Файл .tsx, потому что перехват живёт на событии окна: по `vitest.config.ts`
// окружение выбирает расширение.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { onComposerSubmitRequest, requestComposerSubmit } from '../../donor/app/chat/composer/focus'
import { AecI18nProvider } from '../../shared/i18n'

import { ConflictBlockView } from './ConflictBlockView'
import { installVisibleTurns } from './visible-turns'

interface SeenSubmit {
  displayKind?: string
  text: string
}

let uninstall: (() => void) | undefined
let unsubscribe: (() => void) | undefined
let seen: SeenSubmit[] = []

beforeEach(() => {
  seen = []
  // Порядок как в приложении: перехват ставится из тела `main.tsx`, их
  // обработчик подписывается позже — когда монтируется композер.
  uninstall = installVisibleTurns()
  unsubscribe = onComposerSubmitRequest((detail) => {
    seen.push({ ...(detail as unknown as SeenSubmit) })
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  unsubscribe?.()
  uninstall?.()
  cleanup()
})

/** Их отправка идёт через `setTimeout(…, 0)` — прокручиваем таймеры. */
function flush(): void {
  vi.advanceTimersByTime(1)
}

describe('скрытых ходов не существует', () => {
  it('пометка скрытого хода снимается — их обработчик её уже не видит', () => {
    // Ровно тот вызов, который делает их живой блок на нажатие в рамке
    // (`inline-preview-directive.tsx`).
    requestComposerSubmit('пересчитай ведомость', { target: 'main', displayKind: 'hidden' })
    flush()

    expect(seen).toHaveLength(1)
    expect(seen[0].text).toBe('пересчитай ведомость')
    expect(seen[0].displayKind).toBeUndefined()
  })

  it('блок, отправляющий сообщение при загрузке, тоже виден', () => {
    // Отрицательная проверка из AC13: ход при загрузке — это тот же путь, и
    // прятаться ему тоже негде.
    requestComposerSubmit('я загрузился и сразу пишу агенту', {
      target: 'main',
      displayKind: 'hidden'
    })
    flush()

    expect(seen[0].displayKind).toBeUndefined()
  })

  it('обычная отправка не трогается', () => {
    requestComposerSubmit('обычный вопрос', { target: 'main' })
    flush()

    expect(seen).toEqual([{ target: 'main', text: 'обычный вопрос' }])
  })
})

describe('обратный канал карточки расхождения', () => {
  it('нажатие порождает видимое сообщение с обеими сторонами расхождения', () => {
    render(
      <AecI18nProvider>
        <ConflictBlockView
          attrs={{
            subject: 'Отметка низа ростверка',
            left: '-2.400',
            'left-label': 'ТЗ',
            right: '-2.700',
            'right-label': 'КЖ-01'
          }}
        />
      </AecI18nProvider>
    )

    screen.getByRole('button', { name: 'Разобрать подробнее' }).click()
    flush()

    expect(seen).toHaveLength(1)
    expect(seen[0].displayKind).toBeUndefined()
    expect(seen[0].text).toContain('Отметка низа ростверка')
    expect(seen[0].text).toContain('ТЗ даёт -2.400')
    expect(seen[0].text).toContain('КЖ-01 даёт -2.700')
  })
})
