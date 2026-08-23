// Задача 3C.4 (SPEC UR27, контракт — specs/agent-roster.md §Р4). Одиннадцать их
// случаев сведены к пяти правилам; проверяется каждое, потому что ошибка здесь
// значит, что человек потерял переписку со специалистом.

import { describe, expect, it } from 'vitest'

import { planCanonicalChat, rerouteNewInCanonicalChat } from './canonical-chat-pure'

describe('какую сессию открыть', () => {
  it('живая привязка открывается как есть и не заменяется', () => {
    expect(planCanonicalChat({ pin: 'с-1', preferred: { id: 'с-1' }, answered: true })).toEqual({
      action: 'open',
      sessionId: 'с-1'
    })
  })

  it('сжатая сессия — открываем живую вершину, привязку сохраняем', () => {
    // Ядро отвечает по привязке идентификатором живой вершины цепочки сжатия.
    expect(
      planCanonicalChat({ pin: 'с-1', preferred: { id: 'с-1-вершина' }, answered: true })
    ).toEqual({ action: 'open', sessionId: 'с-1-вершина' })
  })

  it('ядро не ответило — открываем привязку и НИЧЕГО не переписываем', () => {
    expect(planCanonicalChat({ pin: 'с-1', answered: false })).toEqual({
      action: 'open',
      sessionId: 'с-1'
    })
  })

  it('сессии точно нет — перепривязка на показанную, а не на самую новую', () => {
    expect(
      planCanonicalChat({
        pin: 'с-1',
        preferred: null,
        latest: { id: 'с-2' },
        answered: true
      })
    ).toEqual({ action: 'adopt', sessionId: 'с-2' })
  })

  it('сессии нет и истории нет — создаём', () => {
    expect(
      planCanonicalChat({ pin: 'с-1', preferred: null, latest: null, answered: true })
    ).toEqual({ action: 'create' })
  })

  it('привязки нет, но переписка была — усыновляем её, а не начинаем с нуля', () => {
    expect(planCanonicalChat({ pin: '', latest: { id: 'с-7' }, answered: true })).toEqual({
      action: 'adopt',
      sessionId: 'с-7'
    })
  })

  it('нового специалиста ведём в новую сессию', () => {
    expect(planCanonicalChat({ pin: '', latest: null, answered: true })).toEqual({
      action: 'create'
    })
  })

  it('без привязки и без ответа ядра — создаём, но ничего не теряем', () => {
    expect(planCanonicalChat({ pin: '', answered: false })).toEqual({ action: 'create' })
  })
})

// Задача 3C.4б — по их регрессии `canonical-chat-adopt-before-mint`.
describe('привязка потерялась, а чат — нет', () => {
  it('усыновляется НАШ чат, а не последний разговор человека', () => {
    // Ровно их случай: последняя сессия профиля — обычная переписка человека,
    // а постоянный чат специалиста лежит старее.
    expect(
      planCanonicalChat({
        pin: '',
        answered: true,
        ours: { id: 'постоянный' },
        latest: { id: 'разговор-человека' }
      })
    ).toEqual({ action: 'adopt', sessionId: 'постоянный' })
  })

  it('то же при заведомо мёртвой привязке', () => {
    expect(
      planCanonicalChat({
        pin: 'умершая',
        answered: true,
        preferred: null,
        ours: { id: 'постоянный' },
        latest: { id: 'разговор-человека' }
      })
    ).toEqual({ action: 'adopt', sessionId: 'постоянный' })
  })

  it('дедушкино правило цело: нашего чата нет — усыновляем последнюю', () => {
    // У специалиста, заведённого до появления постоянного чата, нашей сессии
    // нет по определению, и новый пустой чат выглядел бы как потеря переписки.
    expect(
      planCanonicalChat({ pin: '', answered: true, ours: null, latest: { id: 'старая' } })
    ).toEqual({ action: 'adopt', sessionId: 'старая' })
  })

  it('живая привязка сильнее всего: наш чат её не подменяет', () => {
    expect(
      planCanonicalChat({
        pin: 'живая',
        answered: true,
        preferred: { id: 'живая' },
        ours: { id: 'другая-наша' }
      })
    ).toEqual({ action: 'open', sessionId: 'живая' })
  })
})

describe('«новый чат» в постоянном чате', () => {
  it('подменяется очисткой контекста', () => {
    expect(rerouteNewInCanonicalChat('/new', 'с-1', 'с-1')).toBe('/compact')
    expect(rerouteNewInCanonicalChat('  /reset  ', 'с-1', 'с-1')).toBe('/compact')
  })

  it('в обычной сессии того же специалиста работает как везде', () => {
    expect(rerouteNewInCanonicalChat('/new', 'с-9', 'с-1')).toBeNull()
  })

  it('другие команды и обычный текст не трогаются', () => {
    expect(rerouteNewInCanonicalChat('/newsletter', 'с-1', 'с-1')).toBeNull()
    expect(rerouteNewInCanonicalChat('/new и ещё текст', 'с-1', 'с-1')).toBeNull()
    expect(rerouteNewInCanonicalChat('посчитай смету', 'с-1', 'с-1')).toBeNull()
  })

  it('без привязки или без сессии не вмешиваемся', () => {
    expect(rerouteNewInCanonicalChat('/new', '', 'с-1')).toBeNull()
    expect(rerouteNewInCanonicalChat('/new', 'с-1', '')).toBeNull()
  })
})
