// Задача 3C.4 (SPEC UR27, контракт — specs/agent-roster.md §Р4), переписана под
// схему ядра 0.20.6 (задача 3.B2б): личность чата — его имя в реестре, а не
// наша привязка. Правил стало четыре; проверяется каждое, потому что ошибка
// здесь значит, что человек потерял переписку со специалистом.
//
// Отдельно и подробно проверяется четвёртое — отказ при недоступном реестре.
// Это единственный оставшийся способ раздвоить вечный чат, и разница между
// «чата нет» и «спросить не удалось» здесь и живёт.

import { describe, expect, it } from 'vitest'

import { planCanonicalChat, rerouteNewInCanonicalChat } from './canonical-chat-pure'

describe('какую сессию открыть', () => {
  it('реестровая строка есть — открываем её', () => {
    expect(
      planCanonicalChat({ registry: { id: 'с-1', resolvedId: 'с-1' } })
    ).toEqual({ action: 'open', sessionId: 'с-1' })
  })

  it('сжатая переписка — открываем живую вершину, а не корень реестра', () => {
    // `id` остаётся личностью строки, `resolved_id` — то, что читает человек.
    expect(
      planCanonicalChat({ registry: { id: 'корень', resolvedId: 'вершина' } })
    ).toEqual({ action: 'open', sessionId: 'вершина' })
  })

  it('вершины нет — открываем сам реестровый идентификатор', () => {
    // Несжатая переписка: ядро отдаёт `resolved_id` равным `id`, но старое
    // могло не отдать его вовсе.
    expect(planCanonicalChat({ registry: { id: 'с-1', resolvedId: '' } })).toEqual({
      action: 'open',
      sessionId: 'с-1'
    })
  })

  it('чата нет, но переписка была — усыновляем её (дедушкино правило)', () => {
    // У специалиста, заведённого до появления постоянного чата, разговор уже
    // идёт, и новая пустая сессия выглядела бы как его потеря.
    expect(planCanonicalChat({ registry: null, latest: { id: 'старая' } })).toEqual({
      action: 'adopt',
      sessionId: 'старая'
    })
  })

  it('нового специалиста ведём в новую сессию', () => {
    expect(planCanonicalChat({ registry: null, latest: null })).toEqual({ action: 'create' })
  })
})

// Главное правило после подъёма на 0.20.6 (задача 3.B2б).
describe('спросить реестр не удалось', () => {
  it('НЕ создаём второй чат — отказываем', () => {
    // Их же сбой: окно перезапускает бэкенды профилей, первый клик обгоняет
    // прогрев, поиск падает — и проглоченная ошибка уводила прямо в
    // `session.create`. Человек читает это как «специалист забыл всё».
    expect(planCanonicalChat({})).toEqual({ action: 'refuse' })
  })

  it('отказ не путается с «чата нет»: при живой переписке тоже отказ', () => {
    expect(planCanonicalChat({ latest: { id: 'старая' } })).toEqual({ action: 'refuse' })
  })

  it('а вот определённое «нет» — не отказ', () => {
    expect(planCanonicalChat({ registry: null, latest: null })).toEqual({ action: 'create' })
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
