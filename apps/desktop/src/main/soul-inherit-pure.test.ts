import { describe, expect, it } from 'vitest'

import { createdProfileByRest, inheritMainSoul, SPECIALIST_HEADING } from './soul-inherit-pure'

const MAIN =
  '# AECPilot — инженерный помощник по конструктивным решениям\n\nТы — ИИ-помощник инженера-конструктора.'
const OWN = '# nk\n\n**Role:** нормоконтроль\n\nYou are nk, a persistent named agent.'

describe('inheritMainSoul (3J.4)', () => {
  it('SOUL главного первым, свой — под заголовком «Специалист»', () => {
    const out = inheritMainSoul(OWN, MAIN)
    expect(out.startsWith(MAIN)).toBe(true)
    expect(out).toContain(`${SPECIALIST_HEADING}\n\n${OWN}`)
  })

  it('повтор не удваивает', () => {
    const once = inheritMainSoul(OWN, MAIN)
    expect(inheritMainSoul(once, MAIN)).toBe(once)
  })

  it('без SOUL главного — без изменений', () => {
    expect(inheritMainSoul(OWN, '')).toBe(OWN)
    expect(inheritMainSoul(OWN, '  \n')).toBe(OWN)
  })

  it('клон главного (SOUL уже его) не меняется', () => {
    expect(inheritMainSoul(`${MAIN}\n`, MAIN)).toBe(`${MAIN}\n`)
  })

  it('пустой свой SOUL — просто SOUL главного', () => {
    expect(inheritMainSoul('', MAIN)).toBe(`${MAIN}\n`)
  })

  it('строка языка в конце своего SOUL остаётся в конце', () => {
    const out = inheritMainSoul(`${OWN}\n\nОтвечай по-русски.`, MAIN)
    expect(out.trimEnd().endsWith('Отвечай по-русски.')).toBe(true)
  })
})

describe('createdProfileByRest', () => {
  it('POST /api/profiles с именем — это создание', () => {
    expect(createdProfileByRest('POST', '/api/profiles', { name: 'nk' })).toBe('nk')
  })

  it('прочее — нет', () => {
    expect(createdProfileByRest('GET', '/api/profiles', { name: 'nk' })).toBeNull()
    expect(createdProfileByRest('POST', '/api/profiles/nk', { name: 'nk' })).toBeNull()
    expect(createdProfileByRest('POST', '/api/profiles', {})).toBeNull()
    expect(createdProfileByRest('POST', '/api/profiles', null)).toBeNull()
  })
})
