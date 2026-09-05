// Задача 3.28. Текст уведомления приходит из ответа модели, поэтому проверяется
// именно то, что модель может прислать: пусто, полотно, мусор вместо кнопок.

import { describe, expect, it } from 'vitest'

import { clampText, planNotification } from './notify-pure'

describe('clampText', () => {
  it('короткая строка проходит как есть', () => {
    expect(clampText('Готово', 80)).toBe('Готово')
  })

  it('переносы и двойные пробелы схлопываются — тост однострочный', () => {
    expect(clampText('  первая\n\nвторая  ', 80)).toBe('первая вторая')
  })

  it('длинная обрезается ВИДИМО, многоточием', () => {
    const text = clampText('a'.repeat(200), 10)
    expect(text).toHaveLength(10)
    expect(text.endsWith('…')).toBe(true)
  })

  it('не-строка — пустая строка, а не «undefined» на экране', () => {
    expect(clampText(undefined, 80)).toBe('')
    expect(clampText(42, 80)).toBe('')
  })
})

describe('planNotification', () => {
  it('обычный случай', () => {
    expect(
      planNotification({
        title: 'Прогон завершён',
        body: 'Обновлено 3 документа',
        sessionId: 's-1',
        kind: 'turnDone'
      })
    ).toEqual({
      title: 'Прогон завершён',
      body: 'Обновлено 3 документа',
      silent: false,
      sessionId: 's-1',
      actions: [],
      // Задача 3D.9. Проверка идёт по ВСЕМУ объекту намеренно: так новое поле
      // в плане нельзя добавить, не показав его здесь.
      activate: '',
      notifyId: '',
      tag: ''
    })
  })

  it('без заголовка не показываем ничего — пустая рамка хуже молчания', () => {
    expect(planNotification({ body: 'что-то' })).toBeNull()
    expect(planNotification({ title: '   ' })).toBeNull()
    expect(planNotification(undefined)).toBeNull()
  })

  it('`silent` только при явном true', () => {
    expect(planNotification({ title: 'x', silent: 'yes' })?.silent).toBe(false)
    expect(planNotification({ title: 'x', silent: true })?.silent).toBe(true)
  })

  it('кнопки без имени или без текста отбрасываются', () => {
    expect(
      planNotification({
        title: 'Нужно подтверждение',
        actions: [
          { id: 'allow', text: 'Разрешить' },
          { id: '', text: 'Без имени' },
          { id: 'deny' },
          'мусор'
        ]
      })?.actions
    ).toEqual([{ id: 'allow', text: 'Разрешить' }])
  })

  it('кнопок не больше трёх', () => {
    const actions = Array.from({ length: 9 }, (_unused, index) => ({
      id: `a${index}`,
      text: `кнопка ${index}`
    }))
    expect(planNotification({ title: 'x', actions })?.actions).toHaveLength(3)
  })

  it('чужой sessionId остаётся строкой, а не объектом', () => {
    expect(planNotification({ title: 'x', sessionId: { evil: true } })?.sessionId).toBe('')
  })

  // -- задача 3D.9: поля плагинного уведомления -------------------------------

  it('рукоятка, путь и ключ повтора доезжают до плана', () => {
    const plan = planNotification({
      title: 'Бот ответил',
      notifyId: 'n-42',
      activate: '/bots/smeta',
      tag: 'bot:smeta'
    })

    expect(plan?.notifyId).toBe('n-42')
    expect(plan?.activate).toBe('/bots/smeta')
    expect(plan?.tag).toBe('bot:smeta')
  })

  it('обычное уведомление не получает плагинных полей — там пустые строки', () => {
    const plan = planNotification({ title: 'Готово', sessionId: 's-1' })

    expect(plan?.notifyId).toBe('')
    expect(plan?.activate).toBe('')
    expect(plan?.tag).toBe('')
  })

  it('чужой notifyId остаётся строкой, а не объектом', () => {
    expect(planNotification({ title: 'x', notifyId: { evil: true } })?.notifyId).toBe('')
  })

  // Служебная строка обрезается НЕ как текст: усечённая рукоятка — это другая
  // рукоятка, по которой приёмник молча ничего не найдёт. Поэтому слишком
  // длинное значение отбрасывается целиком, и многоточия в нём не появляется.
  it('слишком длинная рукоятка отбрасывается целиком, а не режется', () => {
    const plan = planNotification({ title: 'x', notifyId: 'n'.repeat(200) })

    expect(plan?.notifyId).toBe('')
  })

  it('слишком длинный путь активации отбрасывается целиком', () => {
    const plan = planNotification({ title: 'x', activate: '/' + 'a'.repeat(600) })

    expect(plan?.activate).toBe('')
  })
})
