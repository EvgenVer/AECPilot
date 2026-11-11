import { describe, expect, it } from 'vitest'

import { cronBotChatAdd, cronWriteKind } from './cron-tick-notice-pure'

describe('cronWriteKind: какой вызов заводит или включает расписание', () => {
  it('создание задачи — заслуживает', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/cron/jobs' })).toBe('create')
  })

  it('создание из заготовки — тоже создание', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/cron/blueprints/instantiate' })).toBe(
      'create'
    )
  })

  it('включение отключённой задачи — заслуживает', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/cron/jobs/abc123/resume' })).toBe('resume')
  })

  it('строка запроса в пути не мешает узнать вызов', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/cron/jobs?profile=default' })).toBe('create')
  })

  it('чтение списка — не заслуживает', () => {
    expect(cronWriteKind({ path: '/api/cron/jobs' })).toBeNull()
    expect(cronWriteKind({ method: 'GET', path: '/api/cron/jobs' })).toBeNull()
  })

  it('правка не заслуживает: ожидание уже построено при создании', () => {
    expect(cronWriteKind({ method: 'PUT', path: '/api/cron/jobs/abc123' })).toBeNull()
  })

  it('отключение и удаление не заслуживают — они и так в сторону «не сработает»', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/cron/jobs/abc123/pause' })).toBeNull()
    expect(cronWriteKind({ method: 'DELETE', path: '/api/cron/jobs/abc123' })).toBeNull()
  })

  it('ручной запуск не заслуживает: он как раз работает', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/cron/jobs/abc123/trigger' })).toBeNull()
  })

  it('чужие маршруты не задевает', () => {
    expect(cronWriteKind({ method: 'POST', path: '/api/sessions' })).toBeNull()
    expect(cronWriteKind({ method: 'POST', path: '/api/cronx/jobs' })).toBeNull()
  })
})

describe('cronBotChatAdd: рутина, результат которой придёт в чат специалиста (D-163)', () => {
  it('добавление с доставкой в чат специалиста — да', () => {
    expect(
      cronBotChatAdd('cron.manage', { action: 'add', deliver: 'bot-chat', profile: 'smeta' })
    ).toBe(true)
  })

  it('без доставки в чат, не добавление или чужой метод — нет', () => {
    expect(cronBotChatAdd('cron.manage', { action: 'add', profile: 'smeta' })).toBe(false)
    expect(cronBotChatAdd('cron.manage', { action: 'resume', deliver: 'bot-chat' })).toBe(false)
    expect(cronBotChatAdd('session.list', { action: 'add', deliver: 'bot-chat' })).toBe(false)
  })
})
