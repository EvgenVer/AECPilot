// Добавить одно поле в их `config.yaml`, ничего в нём не сломав.
//
// ЗАЧЕМ ЭТО СУЩЕСТВУЕТ. У ядра есть умолчания, которые для нашего продукта
// неверны, и правятся они одинаково: если поле уже задано — не трогать (выбор
// человека всегда старше нашего умолчания), если секции нет — дописать.
// Первым таким полем был голос синтеза (задача 3.7a, `speech-voice-pure.ts`),
// вторым — слово-активатор (3.7b). Тот файл написан раньше и делает то же
// самое для `tts.voice`; свести их в один — работа отдельной задачи, а
// переписывать работающий и покрытый тестами код заодно с новым здесь незачем.
//
// ПОСТРОЧНАЯ ПРАВКА, А НЕ РАЗБОР YAML. Их конфиг человек читает и правит
// руками: там комментарии, порядок и пустые строки, которые он расставил.
// Полный разбор с обратной записью всё это уничтожит — и это будет не «правка
// поля», а подмена файла.

export interface ConfigScalarResult {
  text: string
  changed: boolean
  /** Секция есть, но она скаляр (`tts: off`) — построчной правкой это не
   * чинится, и файл оставляется как есть. */
  unexpectedStructure: boolean
}

const TOP_LEVEL_LINE = /^\S/

/**
 * Дописывает `key: value` в секцию `section`, если такого ключа там ещё нет.
 *
 * Ничего не делает, если ключ уже есть — с любым значением. Это половина
 * смысла: правило зовётся на каждом старте, и однажды выбранное человеком
 * значение обязано пережить все следующие запуски.
 *
 * Число пишется числом, булево — словом `true`/`false`, строка — в кавычках.
 * Разница не косметическая: этот файл человек читает и правит руками, и
 * `run_budget_seconds: "3600"` он прочитает как чужую ошибку. Ядро-то
 * стерпит (`float(value)`), а человек поверит, что число здесь почему-то
 * текст. Булево в кавычках хуже: `auto_prune: "false"` для их YAML — непустая
 * строка, то есть ИСТИНА, ровно обратное записанному (задача 3.B4д).
 */
export function ensureSectionScalar(
  yamlText: string,
  section: string,
  key: string,
  value: boolean | number | string
): ConfigScalarResult {
  const sectionLine = new RegExp(`^${section}:\\s*(#.*)?$`)
  const sectionScalar = new RegExp(`^${section}:\\s*[^#\\s]`)
  const keyLine = new RegExp(`^\\s+${key}:`)

  const written = typeof value === 'string' ? JSON.stringify(value) : String(value)
  const lines = yamlText.split('\n')

  if (lines.some((line) => sectionScalar.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const start = lines.findIndex((line) => sectionLine.test(line))

  if (start === -1) {
    const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
    const block = `${section}:\n  ${key}: ${written}\n`
    return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TOP_LEVEL_LINE.test(lines[index])) {
      end = index
      break
    }
  }

  const body = lines.slice(start + 1, end)
  if (body.some((line) => keyLine.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const next = [...lines.slice(0, start + 1), `  ${key}: ${written}`, ...body, ...lines.slice(end)]

  return { text: next.join('\n'), changed: true, unexpectedStructure: false }
}

/**
 * Ставит `key: value` в секции `section` ВСЕГДА — и когда ключа нет, и когда
 * он задан другим значением (задача 3H.4).
 *
 * Исключение из правила «выбор человека старше умолчания», и потому отдельная
 * функция, а не флаг у `ensureSectionScalar`: здесь пишется не умолчание, а
 * граница объёма. Голос вне продукта (SPEC HX19, решение владельца 2026-10-07),
 * и `wake_word.enabled: true`, оставшееся в профиле от прежней сборки, заставляет
 * ядро ставить пакеты в своё окружение (D-184) — то есть выбора, который стоило
 * бы беречь, здесь нет.
 *
 * Трогается только прямой потомок секции (два пробела отступа): одноимённый
 * ключ глубже — чужое поле. Комментарий в конце строки ключа уходит вместе со
 * старым значением — он описывал его.
 */
export function forceSectionScalar(
  yamlText: string,
  section: string,
  key: string,
  value: boolean | number | string
): ConfigScalarResult {
  const sectionScalar = new RegExp(`^${section}:\\s*[^#\\s]`)
  const sectionLine = new RegExp(`^${section}:\\s*(#.*)?$`)
  const keyLine = new RegExp(`^  ${key}:(.*)$`)

  const written = typeof value === 'string' ? JSON.stringify(value) : String(value)
  const lines = yamlText.split('\n')

  if (lines.some((line) => sectionScalar.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const start = lines.findIndex((line) => sectionLine.test(line))
  if (start === -1) return ensureSectionScalar(yamlText, section, key, value)

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TOP_LEVEL_LINE.test(lines[index])) {
      end = index
      break
    }
  }

  const at = lines.slice(start + 1, end).findIndex((line) => keyLine.test(line))
  if (at === -1) {
    // Не `ensureSectionScalar`: тот ищет ключ на любой глубине и, найдя
    // одноимённый ниже (`stt: local: enabled:`), ничего бы не дописал.
    const inserted = [
      ...lines.slice(0, start + 1),
      `  ${key}: ${written}`,
      ...lines.slice(start + 1)
    ]
    return { text: inserted.join('\n'), changed: true, unexpectedStructure: false }
  }

  const index = start + 1 + at
  const current = (keyLine.exec(lines[index])?.[1] ?? '').replace(/#.*$/, '').trim()
  if (current === written) return { text: yamlText, changed: false, unexpectedStructure: false }

  const next = [...lines]
  next[index] = `  ${key}: ${written}`
  return { text: next.join('\n'), changed: true, unexpectedStructure: false }
}

/**
 * То же правило на глубине три: `section: sub: key: value` (задача 3.B6г —
 * `vault.bitwarden.enabled`). Ключ есть — файл не трогается; нет подсекции —
 * она дописывается в начало секции; нет секции — блок целиком в конец файла.
 *
 * Отступы — те, какими пишут они сами: два пробела на уровень. Подсекция,
 * записанная скаляром или потоком (`bitwarden: {enabled: true}`), — чужая
 * форма, которую строками не починить: файл оставляется как есть.
 */
export function ensureNestedScalar(
  yamlText: string,
  section: string,
  sub: string,
  key: string,
  value: boolean | number | string
): ConfigScalarResult {
  const written = typeof value === 'string' ? JSON.stringify(value) : String(value)
  return ensureNestedKey(yamlText, section, sub, key, [`    ${key}: ${written}`])
}

/**
 * Список на глубине три: `section: sub: key: [...]` (задача 3G.10 —
 * `tools.tool_search.defer`). Правило то же, что у скаляра выше: ключ есть в
 * любой форме (`defer: []` тоже) — файл не трогается.
 */
export function ensureNestedList(
  yamlText: string,
  section: string,
  sub: string,
  key: string,
  values: readonly string[]
): ConfigScalarResult {
  return ensureNestedKey(yamlText, section, sub, key, [
    `    ${key}:`,
    ...values.map((value) => `      - ${value}`)
  ])
}

function ensureNestedKey(
  yamlText: string,
  section: string,
  sub: string,
  key: string,
  keyLines: readonly string[]
): ConfigScalarResult {
  const lines = yamlText.split('\n')
  const sectionLine = new RegExp(`^${section}:\\s*(#.*)?$`)
  const sectionScalar = new RegExp(`^${section}:\\s*[^#\\s]`)
  const subLine = new RegExp(`^  ${sub}:\\s*(#.*)?$`)
  const subScalar = new RegExp(`^  ${sub}:\\s*[^#\\s]`)
  const keyLine = new RegExp(`^    ${key}:`)

  if (lines.some((line) => sectionScalar.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const start = lines.findIndex((line) => sectionLine.test(line))
  if (start === -1) {
    const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
    const block = [`${section}:`, `  ${sub}:`, ...keyLines].map((line) => `${line}\n`).join('')
    return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TOP_LEVEL_LINE.test(lines[index])) {
      end = index
      break
    }
  }

  const body = lines.slice(start + 1, end)
  if (body.some((line) => subScalar.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const subStart = body.findIndex((line) => subLine.test(line))
  if (subStart === -1) {
    const next = [...lines.slice(0, start + 1), `  ${sub}:`, ...keyLines, ...lines.slice(start + 1)]
    return { text: next.join('\n'), changed: true, unexpectedStructure: false }
  }

  let subEnd = body.length
  for (let index = subStart + 1; index < body.length; index += 1) {
    if (/^ {0,2}\S/.test(body[index])) {
      subEnd = index
      break
    }
  }

  if (body.slice(subStart + 1, subEnd).some((line) => keyLine.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const at = start + 1 + subStart + 1
  const next = [...lines.slice(0, at), ...keyLines, ...lines.slice(at)]
  return { text: next.join('\n'), changed: true, unexpectedStructure: false }
}

/**
 * Дописывает список верхнего уровня `key:`, если такого ключа в файле ещё нет.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ ПАРАМЕТР К ПРЕДЫДУЩЕЙ. Правило выше пишет
 * `секция: ключ: значение` — вложенный скаляр. Здесь нужен список НА ВЕРХНЕМ
 * уровне (`toolsets:`), и это другая форма файла, а не другое значение.
 *
 * ПРАВИЛО ТО ЖЕ: ключ есть — файл не трогается, каким бы список ни был. То
 * есть свой блок `toolsets:` человека переживает все следующие запуски, и мы
 * в него ничего не дописываем. Дописывать в чужой список молча — значит
 * возвращать то, что человек мог убрать сознательно.
 */
export function ensureTopLevelList(
  yamlText: string,
  key: string,
  values: readonly string[]
): ConfigScalarResult {
  const keyLine = new RegExp(`^${key}:`)

  if (yamlText.split('\n').some((line) => keyLine.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
  const block = `${key}:\n${values.map((value) => `  - ${value}\n`).join('')}`

  return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
}

/**
 * Дописывает СПИСОК внутрь секции (`agent: disabled_toolsets: [...]`), если
 * такого ключа в этой секции ещё нет.
 *
 * Третья форма файла: скаляр в секции, список наверху, список в секции. Ядро
 * стерпело бы и строку с JSON внутри — `parse_config_string_list` разбирает
 * `"['tts']"` намеренно, — но человек, читающий этот файл, прочитает такую
 * строку как нашу ошибку. Пишем тем же видом, каким это пишут они сами.
 *
 * Правило прежнее: ключ есть — файл не трогается.
 */
export function ensureSectionList(
  yamlText: string,
  section: string,
  key: string,
  values: readonly string[]
): ConfigScalarResult {
  const sectionLine = new RegExp(`^${section}:\\s*(#.*)?$`)
  const sectionScalar = new RegExp(`^${section}:\\s*[^#\\s]`)
  const keyLine = new RegExp(`^\\s+${key}:`)

  const written = values.map((value) => `    - ${value}`)
  const lines = yamlText.split('\n')

  if (lines.some((line) => sectionScalar.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const start = lines.findIndex((line) => sectionLine.test(line))

  if (start === -1) {
    const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
    const block = `${section}:\n  ${key}:\n${written.map((line) => `${line}\n`).join('')}`
    return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TOP_LEVEL_LINE.test(lines[index])) {
      end = index
      break
    }
  }

  const body = lines.slice(start + 1, end)
  if (body.some((line) => keyLine.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const next = [...lines.slice(0, start + 1), `  ${key}:`, ...written, ...body, ...lines.slice(end)]

  return { text: next.join('\n'), changed: true, unexpectedStructure: false }
}

/**
 * Дефект D-129. Заменяет список внутри секции, но ТОЛЬКО если он в точности
 * равен нашему прежнему умолчанию `previous` — тем же видом, каким его пишет
 * `ensureSectionList`. Так профиль, куда мы однажды записали старое умолчание,
 * получает новое, а список, который человек поменял сам, не трогается.
 */
export function upgradeSectionList(
  yamlText: string,
  section: string,
  key: string,
  previous: readonly string[],
  next: readonly string[]
): ConfigScalarResult {
  const unchanged = { text: yamlText, changed: false, unexpectedStructure: false }
  const lines = yamlText.split('\n')
  const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*(#.*)?$`).test(line))
  if (start === -1) return unchanged

  let keyIndex = -1
  for (
    let index = start + 1;
    index < lines.length && !TOP_LEVEL_LINE.test(lines[index]);
    index += 1
  ) {
    if (new RegExp(`^  ${key}:\\s*$`).test(lines[index])) {
      keyIndex = index
      break
    }
  }
  if (keyIndex === -1) return unchanged

  const items: string[] = []
  let end = keyIndex + 1
  while (end < lines.length && /^ {4}- \S+\s*$/.test(lines[end])) {
    items.push(lines[end].trim().slice(2).trim())
    end += 1
  }
  if (items.length !== previous.length || items.some((item, index) => item !== previous[index])) {
    return unchanged
  }

  const written = next.map((value) => `    - ${value}`)
  const text = [...lines.slice(0, keyIndex + 1), ...written, ...lines.slice(end)].join('\n')
  return { text, changed: true, unexpectedStructure: false }
}

/**
 * Задача T20.5. То же, что `upgradeSectionList`, на третьем уровне
 * (`tools.tool_search.defer`): список заменяется, ТОЛЬКО если он в точности
 * равен одному из наших прежних умолчаний — тем видом, каким его пишет
 * `ensureNestedList`. Список, который человек поменял, не трогается.
 */
export function upgradeNestedList(
  yamlText: string,
  section: string,
  sub: string,
  key: string,
  previous: readonly (readonly string[])[],
  next: readonly string[]
): ConfigScalarResult {
  const unchanged = { text: yamlText, changed: false, unexpectedStructure: false }
  const lines = yamlText.split('\n')
  const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*(#.*)?$`).test(line))
  if (start === -1) return unchanged

  let subIndex = -1
  let index = start + 1
  for (; index < lines.length && !TOP_LEVEL_LINE.test(lines[index]); index += 1) {
    if (new RegExp(`^  ${sub}:\\s*$`).test(lines[index])) {
      subIndex = index
      break
    }
  }
  if (subIndex === -1) return unchanged

  let keyIndex = -1
  for (index = subIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (TOP_LEVEL_LINE.test(line) || /^ {2}\S/.test(line)) break
    if (new RegExp(`^    ${key}:\\s*$`).test(line)) {
      keyIndex = index
      break
    }
  }
  if (keyIndex === -1) return unchanged

  const items: string[] = []
  let end = keyIndex + 1
  while (end < lines.length && /^ {6}- \S+\s*$/.test(lines[end])) {
    items.push(lines[end].trim().slice(2).trim())
    end += 1
  }
  const matches = previous.some(
    (list) => list.length === items.length && list.every((item, at) => item === items[at])
  )
  if (!matches) return unchanged

  const written = next.map((value) => `      - ${value}`)
  const text = [...lines.slice(0, keyIndex + 1), ...written, ...lines.slice(end)].join('\n')
  return { text, changed: true, unexpectedStructure: false }
}
