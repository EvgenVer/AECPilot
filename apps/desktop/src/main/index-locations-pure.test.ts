// Task T30: the uninstaller's list of project indexes.

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  addIndexLocation,
  parseIndexLocations,
  serializeIndexLocations
} from './index-locations-pure'

const vault = join('D:', 'Проекты', 'Мост')

describe('index locations', () => {
  it('round-trips Cyrillic paths as UTF-16LE lines without a BOM', () => {
    const bytes = serializeIndexLocations([vault, join('E:', 'b')])

    expect(bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))).toBe(false)
    expect(bytes.toString('utf16le')).toBe(`${vault}\r\n${join('E:', 'b')}\r\n`)
    expect(parseIndexLocations(bytes)).toEqual([vault, join('E:', 'b')])
  })

  it('adds a project once, whatever the case or a trailing separator', () => {
    const once = addIndexLocation([], vault)
    expect(addIndexLocation(once, `${vault.toUpperCase()}\\`)).toEqual([vault])
    expect(addIndexLocation(once, join('E:', 'b'))).toEqual([vault, join('E:', 'b')])
  })

  it('reads an empty or missing file as no projects', () => {
    expect(parseIndexLocations(Buffer.alloc(0))).toEqual([])
  })
})
