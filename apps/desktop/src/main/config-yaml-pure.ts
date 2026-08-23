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
 * Число пишется числом, строка — в кавычках. Разница не косметическая: этот
 * файл человек читает и правит руками, и `run_budget_seconds: "3600"` он
 * прочитает как чужую ошибку. Ядро-то стерпит (`float(value)`), а человек
 * поверит, что число здесь почему-то текст.
 */
export function ensureSectionScalar(
  yamlText: string,
  section: string,
  key: string,
  value: number | string
): ConfigScalarResult {
  const sectionLine = new RegExp(`^${section}:\\s*(#.*)?$`)
  const sectionScalar = new RegExp(`^${section}:\\s*[^#\\s]`)
  const keyLine = new RegExp(`^\\s+${key}:`)

  const written = typeof value === 'number' ? String(value) : JSON.stringify(value)
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

  const next = [
    ...lines.slice(0, start + 1),
    `  ${key}: ${written}`,
    ...body,
    ...lines.slice(end)
  ]

  return { text: next.join('\n'), changed: true, unexpectedStructure: false }
}
