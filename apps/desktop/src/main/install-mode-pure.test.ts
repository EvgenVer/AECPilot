import { describe, expect, it } from 'vitest'

import { appRole, parseInstallMode } from './install-mode-pure'

describe('режим установки (T31)', () => {
  it('одно слово, без учёта регистра, BOM и перевода строки', () => {
    expect(parseInstallMode('client\r\n')).toBe('client')
    expect(parseInstallMode(`${String.fromCharCode(0xfeff)}Server`)).toBe('server')
    expect(parseInstallMode(' full ')).toBe('full')
  })

  it('неизвестное слово и отсутствие файла — нет режима', () => {
    expect(parseInstallMode('everything')).toBeNull()
    expect(parseInstallMode('')).toBeNull()
    expect(parseInstallMode(null)).toBeNull()
  })
})

describe('роль запуска (T31)', () => {
  it('установка «только сервер» — сервер и без ключа', () => {
    expect(appRole('server', [])).toBe('server')
  })

  it('ключ --server делает сервером полную установку и рабочую копию', () => {
    expect(appRole('full', ['AECPilot.exe', '--server'])).toBe('server')
    expect(appRole(null, ['electron', '.', '--server'])).toBe('server')
  })

  it('клиентская установка остаётся клиентом и с ключом: ядра на диске нет', () => {
    expect(appRole('client', ['AECPilot.exe', '--server'])).toBe('client')
  })

  it('без режима и ключа — всё на этой машине', () => {
    expect(appRole(null, ['AECPilot.exe'])).toBe('full')
  })
})
