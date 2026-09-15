// Задачи 3.7a/3.7b. Проверяется то, ради чего правка построчная: чужой файл,
// который человек читает и правит руками, должен пережить нашу запись целиком —
// с комментариями, порядком и уже сделанным выбором.

import { describe, expect, it } from 'vitest'

import { ensureSectionList, ensureSectionScalar, ensureTopLevelList } from './config-yaml-pure'

describe('дописать поле в их конфиг', () => {
  it('секции нет — добавляется целиком', () => {
    const result = ensureSectionScalar('model:\n  name: x\n', 'wake_word', 'phrase', 'hey pilot')

    expect(result.changed).toBe(true)
    expect(result.text).toContain('wake_word:')
    expect(result.text).toContain('phrase: "hey pilot"')
    expect(result.text, 'соседняя секция цела').toContain('model:')
  })

  it('секция есть, ключа нет — добавляется ключ', () => {
    const result = ensureSectionScalar(
      'wake_word:\n  enabled: true\n',
      'wake_word',
      'phrase',
      'hey pilot'
    )

    expect(result.changed).toBe(true)
    expect(result.text).toContain('  phrase: "hey pilot"')
    expect(result.text).toContain('  enabled: true')
  })

  it('ключ уже есть — файл не трогается, каким бы значение ни было', () => {
    const chosen = 'wake_word:\n  phrase: "эй помощник"\n'

    expect(ensureSectionScalar(chosen, 'wake_word', 'phrase', 'hey pilot')).toEqual({
      text: chosen,
      changed: false,
      unexpectedStructure: false
    })
  })

  it('комментарии и пустые строки внутри секции остаются', () => {
    const yaml = [
      'wake_word:',
      '  # включено вручную',
      '  enabled: true',
      '',
      'model:',
      '  name: x',
      ''
    ].join('\n')

    const result = ensureSectionScalar(yaml, 'wake_word', 'phrase', 'hey pilot')

    expect(result.text).toContain('  # включено вручную')
    expect(result.text).toContain('\n\nmodel:')
  })

  it('секция-скаляр — файл оставляется как есть', () => {
    expect(
      ensureSectionScalar('wake_word: off\n', 'wake_word', 'phrase', 'hey pilot')
    ).toMatchObject({ changed: false, unexpectedStructure: true })
  })

  it('повторный вызов ничего не меняет', () => {
    const once = ensureSectionScalar('model:\n  name: x\n', 'wake_word', 'phrase', 'hey pilot')
    const twice = ensureSectionScalar(once.text, 'wake_word', 'phrase', 'hey pilot')

    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once.text)
  })

  it('значение с кавычками не разваливает файл', () => {
    const result = ensureSectionScalar('', 'wake_word', 'phrase', 'скажи "пилот"')
    expect(result.text).toContain(String.raw`phrase: "скажи \"пилот\""`)
  })

  // Задача 3.B1д. Число обязано лечь числом: ядро стерпело бы и `"3600"`
  // (`float(value)`), но этот файл читает человек, и число в кавычках он
  // прочитает как чужую ошибку — и «поправит».
  it('число пишется без кавычек, строка — в кавычках', () => {
    expect(ensureSectionScalar('', 'agent', 'run_budget_seconds', 3600).text).toContain(
      'run_budget_seconds: 3600'
    )
    expect(ensureSectionScalar('', 'agent', 'note', '3600').text).toContain('note: "3600"')
  })

  // Задача 3.B4д. Булево в кавычках для их YAML — непустая строка, то есть
  // истина: `auto_prune: "false"` включило бы то, что должно было выключить.
  it('булево пишется словом, без кавычек', () => {
    expect(ensureSectionScalar('', 'sessions', 'auto_prune', false).text).toBe(
      'sessions:\n  auto_prune: false\n'
    )
    expect(ensureSectionScalar('', 'nous', 'guest', true).text).toContain('guest: true')
  })

  // Решение владельца 2026-09-14: у ядра 0.21.2 умолчание `sessions.auto_prune`
  // стало `true` (удалять завершённые сессии старше 90 дней), а `nous.guest` —
  // бесплатный ярус их облака (SPEC HX3). Оба закрепляются УМОЛЧАНИЕМ: человек
  // правит значение в том же файле, и правило больше его не трогает.
  it('выключенная чистка сессий ставится, а выбранное человеком не переписывается', () => {
    const fresh = ensureSectionScalar('agent:\n  model: x\n', 'sessions', 'auto_prune', false)
    expect(fresh.changed).toBe(true)
    expect(fresh.text).toBe('agent:\n  model: x\nsessions:\n  auto_prune: false\n')

    const chosen = ensureSectionScalar(
      'sessions:\n  auto_prune: true\n',
      'sessions',
      'auto_prune',
      false
    )
    expect(chosen.changed).toBe(false)
    expect(chosen.text).toBe('sessions:\n  auto_prune: true\n')
  })

  // Решение владельца 2026-09-15 (замечание D-88, SPEC R10, задача 3.B5д):
  // проверка обновлений ядра на `api.github.com` при каждом старте шлюза
  // выключается тем же правилом — умолчанием, которое не трогает выбранное.
  it('проверка обновлений ядра выключается, а включённая человеком остаётся', () => {
    const fresh = ensureSectionScalar('sessions:\n  auto_prune: false\n', 'updates', 'check', false)
    expect(fresh.changed).toBe(true)
    expect(fresh.text).toBe('sessions:\n  auto_prune: false\nupdates:\n  check: false\n')

    const chosen = ensureSectionScalar('updates:\n  check: true\n', 'updates', 'check', false)
    expect(chosen.changed).toBe(false)
    expect(chosen.text).toBe('updates:\n  check: true\n')
  })

  // Замечание D-40, решение владельца 2026-08-24. `/loop` приходит в композер из
  // каталога ядра БЕЗ нашей работы, и их умолчание — сто ходов одной строкой.
  // Опускаем до десяти, но именно УМОЛЧАНИЕМ: человек правит число в том же
  // файле, и правило больше его не трогает.
  it('потолок циклов ставится, а выбранный человеком не переписывается', () => {
    const first = ensureSectionScalar('', 'loops', 'max_ticks', 10)
    expect(first.text).toContain('max_ticks: 10')
    expect(first.changed).toBe(true)

    const chosen = ensureSectionScalar('loops:\n  max_ticks: 0\n', 'loops', 'max_ticks', 10)
    // `0` у них означает «без предела» — то есть человек снял потолок сознательно,
    // и вернуть его обратно было бы отменой его решения.
    expect(chosen.text).toContain('max_ticks: 0')
    expect(chosen.changed).toBe(false)
  })
})

// Задача 3E.13 (UR38). Набор `kanban` их ядро прячет от обычного разговора
// намеренно: `_check_kanban_mode` пускает к доске либо рабочего, порождённого
// диспетчером, либо профиль, у которого `kanban` записан в `toolsets`. Второй
// путь — наш, потому что доской у нас управляет тот же агент, с которым человек
// разговаривает.
describe('список наборов верхнего уровня', () => {
  it('ключа нет — список дописывается целиком', () => {
    const result = ensureTopLevelList('model:\n  name: x\n', 'toolsets', ['hermes-cli', 'kanban'])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('toolsets:\n  - hermes-cli\n  - kanban\n')
    expect(result.text, 'соседняя секция цела').toContain('model:\n  name: x')
  })

  it('свой список человека не трогается', () => {
    // Дописать в чужой список молча значило бы вернуть то, что он мог убрать.
    const chosen = 'toolsets:\n  - hermes-cli\n'

    expect(ensureTopLevelList(chosen, 'toolsets', ['hermes-cli', 'kanban'])).toEqual({
      text: chosen,
      changed: false,
      unexpectedStructure: false
    })
  })

  it('ключ с тем же концом имени за свой не принимается', () => {
    // В их же конфиге рядом лежит `known_builtin_toolsets:` — кэш самого ядра.
    const result = ensureTopLevelList('known_builtin_toolsets:\n  cli:\n    - web\n', 'toolsets', [
      'hermes-cli',
      'kanban'
    ])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('known_builtin_toolsets:')
    expect(result.text).toContain('toolsets:\n  - hermes-cli\n')
  })

  it('файл без завершающего перевода строки не склеивается', () => {
    expect(ensureTopLevelList('model: x', 'toolsets', ['kanban']).text).toBe(
      'model: x\ntoolsets:\n  - kanban\n'
    )
  })
})

// Замечание D-67. SPEC HX19 исключает ответ агента вслух, а свежий профиль даёт
// модели набор `tts`. Точный выключатель у ядра один — `agent.disabled_toolsets`:
// он ВЫЧИТАЕТСЯ последним и не сносит остальное, в отличие от `platform_toolsets`,
// который однажды обрезал агента до 8 наборов из 19 (D-66).
describe('список внутри секции', () => {
  it('секции нет — добавляется секция со списком', () => {
    const result = ensureSectionList('model:\n  name: x\n', 'agent', 'disabled_toolsets', ['tts'])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('agent:\n  disabled_toolsets:\n    - tts\n')
  })

  it('секция есть, ключа нет — список встаёт в неё', () => {
    const result = ensureSectionList(
      'agent:\n  run_budget_seconds: 3600\n',
      'agent',
      'disabled_toolsets',
      ['tts']
    )

    expect(result.changed).toBe(true)
    expect(result.text).toContain('  disabled_toolsets:\n    - tts')
    expect(result.text, 'соседний ключ цел').toContain('  run_budget_seconds: 3600')
  })

  it('свой список человека не трогается', () => {
    const chosen = 'agent:\n  disabled_toolsets:\n    - memory\n'

    expect(ensureSectionList(chosen, 'agent', 'disabled_toolsets', ['tts'])).toEqual({
      text: chosen,
      changed: false,
      unexpectedStructure: false
    })
  })

  it('секция-скаляр — файл оставляется как есть', () => {
    expect(ensureSectionList('agent: off\n', 'agent', 'disabled_toolsets', ['tts'])).toMatchObject({
      changed: false,
      unexpectedStructure: true
    })
  })
})
