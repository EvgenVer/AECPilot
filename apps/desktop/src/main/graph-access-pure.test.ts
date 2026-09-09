// Задача 3E.9а — чтение готовности Microsoft Graph из профиля.
//
// Проверяется ровно то, из-за чего эта читалка существует: «не хватает одного из
// четырёх» должно быть видно, а не выглядеть как «всё выключено». Поэтому тесты
// идут от настоящего профиля — с чужими ключами, комментариями и обеими записями
// списка.

import { describe, expect, it } from 'vitest'

import {
  GRAPH_ENV_VARS,
  readChannelEnabled,
  readEnabledPlugins,
  readGraphReadiness
} from './graph-access-pure'

const PROFILE = [
  'model:',
  '  default: "gpt-5"',
  'plugins:',
  '  enabled:',
  '    - a2a-platform',
  '    - teams_pipeline   # разбор встреч',
  '  disabled:',
  '    - alibaba-coding-plan-provider',
  'platforms:',
  '  telegram:',
  '    streaming: true',
  '  msgraph_webhook:',
  '    enabled: true',
  '    port: 8646',
  '  teams:',
  '    enabled: false',
  '_config_version: 32',
  ''
].join('\n')

describe('readEnabledPlugins', () => {
  it('читает список строками, не путая его с disabled', () => {
    expect(readEnabledPlugins(PROFILE)).toEqual(['a2a-platform', 'teams_pipeline'])
  })

  it('понимает и поточную запись — ядро принимает обе', () => {
    const inline = ['plugins:', '  enabled: ["teams-platform", teams_pipeline]', ''].join('\n')

    expect(readEnabledPlugins(inline)).toEqual(['teams-platform', 'teams_pipeline'])
  })

  it('нет раздела — пустой список, а не выдумка', () => {
    expect(readEnabledPlugins('model:\n  default: "gpt-5"\n')).toEqual([])
    expect(readEnabledPlugins('plugins:\n  disabled:\n    - x\n')).toEqual([])
  })
})

describe('readChannelEnabled', () => {
  it('включённый канал виден, выключенный — выключен', () => {
    expect(readChannelEnabled(PROFILE, 'msgraph_webhook')).toBe(true)
    expect(readChannelEnabled(PROFILE, 'teams')).toBe(false)
  })

  it('канал без ключа enabled считается выключенным — это умолчание ядра', () => {
    expect(readChannelEnabled(PROFILE, 'telegram')).toBe(false)
  })

  it('канала нет в профиле — выключен', () => {
    expect(readChannelEnabled(PROFILE, 'slack')).toBe(false)
  })
})

describe('readGraphReadiness', () => {
  it('показывает, чего именно не хватает', () => {
    // Настроить три места из четырёх и получить тишину — это и есть то, что
    // экран обязан предотвратить.
    expect(readGraphReadiness(PROFILE)).toEqual({
      channels: { notifications: true, teams: false },
      plugins: { channel: false, pipeline: true }
    })
  })

  it('пустой профиль — всё выключено, без исключений', () => {
    expect(readGraphReadiness('')).toEqual({
      channels: { notifications: false, teams: false },
      plugins: { channel: false, pipeline: false }
    })
  })
})

describe('переменные приложения Azure AD', () => {
  it('их ровно три, и имена — те, что читает ядро', () => {
    // `GraphCredentials.from_env` в `tools/microsoft_graph_auth.py` не читает
    // config.yaml вовсе; опечатка в имени означала бы «ключ введён, а доступа
    // нет», и искать её человек будет не здесь.
    expect([...GRAPH_ENV_VARS]).toEqual([
      'MSGRAPH_TENANT_ID',
      'MSGRAPH_CLIENT_ID',
      'MSGRAPH_CLIENT_SECRET'
    ])
  })
})
