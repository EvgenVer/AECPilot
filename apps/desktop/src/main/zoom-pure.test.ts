// Задача 3.26. Шкала здесь чужая (Electron: `factor = 1.2 ** level`), а её
// края — наши, и проверяется именно то, что человек может сломать: слишком
// большой процент, испорченный файл настройки, шаг с клавиатуры мимо пресетов.

import { describe, expect, it } from 'vitest'

import {
  clampPercent,
  levelForPercent,
  parseZoomJson,
  percentForLevel,
  serializeZoom,
  steppedPercent,
  ZOOM_DEFAULT_PERCENT,
  ZOOM_MAX_PERCENT,
  ZOOM_MIN_PERCENT,
  ZOOM_PRESETS
} from './zoom-pure'

describe('шкала Electron', () => {
  it('100% — это нулевой уровень', () => {
    expect(levelForPercent(100)).toBe(0)
    expect(percentForLevel(0)).toBe(100)
  })

  it('перевод туда и обратно возвращает тот же процент на каждом пресете', () => {
    for (const preset of ZOOM_PRESETS) {
      expect(percentForLevel(levelForPercent(preset))).toBe(preset)
    }
  })

  it('шаг вверх — ровно один множитель 1.2', () => {
    expect(percentForLevel(1)).toBe(120)
    expect(percentForLevel(-1)).toBe(83)
  })
})

describe('clampPercent', () => {
  it('держит края', () => {
    expect(clampPercent(10)).toBe(ZOOM_MIN_PERCENT)
    expect(clampPercent(1000)).toBe(ZOOM_MAX_PERCENT)
  })

  it('мусор превращается в умолчание, а не в NaN на экране', () => {
    expect(clampPercent(Number.NaN)).toBe(ZOOM_DEFAULT_PERCENT)
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(ZOOM_DEFAULT_PERCENT)
  })

  it('дробное округляется — процент показывается целым', () => {
    expect(clampPercent(112.4)).toBe(112)
  })
})

describe('steppedPercent', () => {
  it('ходит по тем же значениям, что предлагает экран настроек', () => {
    expect(steppedPercent(100, 'in')).toBe(110)
    expect(steppedPercent(110, 'out')).toBe(100)
    expect(steppedPercent(90, 'out')).toBe(ZOOM_MIN_PERCENT)
    expect(steppedPercent(ZOOM_DEFAULT_PERCENT, 'out')).toBe(90)
  })

  it('за краями списка упирается в границы, а не уходит дальше', () => {
    expect(steppedPercent(ZOOM_MAX_PERCENT, 'in')).toBe(ZOOM_MAX_PERCENT)
    expect(steppedPercent(ZOOM_MIN_PERCENT, 'out')).toBe(ZOOM_MIN_PERCENT)
  })

  it('значение вне пресетов подхватывается ближайшим сверху/снизу', () => {
    expect(steppedPercent(105, 'in')).toBe(110)
    expect(steppedPercent(105, 'out')).toBe(100)
  })
})

describe('хранение между запусками', () => {
  it('записанное читается обратно', () => {
    expect(parseZoomJson(serializeZoom(125))).toBe(125)
  })

  it('испорченный файл даёт умолчание, а не падение окна на старте', () => {
    expect(parseZoomJson('{')).toBe(ZOOM_DEFAULT_PERCENT)
    expect(parseZoomJson('null')).toBe(ZOOM_DEFAULT_PERCENT)
    expect(parseZoomJson('{"percent":"много"}')).toBe(ZOOM_DEFAULT_PERCENT)
  })

  it('значение из файла тоже прижимается к краям', () => {
    expect(parseZoomJson('{"percent":10000}')).toBe(ZOOM_MAX_PERCENT)
  })
})
