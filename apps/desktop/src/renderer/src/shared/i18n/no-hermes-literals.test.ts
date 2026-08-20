// Вторая половина требования C12: строки, вшитые прямо в код их экранов.
//
// Каталог держит `no-hermes.test.ts`, но часть текста у донора живёт литералами
// и мимо каталога не проходит — «AECPilot is thinking» в ленте, ошибки шлюза,
// описания каналов, подпись слова-активатора. Их правит правка [5] (AGENTS §14,
// разрешена владельцем 2026-08-20), а этот тест не даёт им вернуться при
// следующем переносе донора: он читает ИСХОДНИКИ зоны и падает на любом новом
// литерале с их именем.
//
// ЧТО ПРОПУСКАЕТСЯ И ПОЧЕМУ. (1) Комментарии — не интерфейс: пояснение «этот
// текст раньше говорил Starting Hermes…» рассказывает историю строки и должно
// остаться правдой. (2) Технические вхождения — ключи хранилища, имена событий
// окна, типы MIME, партиции, классы CSS, пути REST, имена их модулей и типов:
// человек их не видит, а переименование сломало бы совместимость с их же кодом
// (то же исключение записано в SPEC C12). (3) `lib/voice-stop-word.ts` — там не
// подписи, а ФРАЗЫ, которые человек произносит вслух, чтобы прервать ответ;
// менять их вместе с именем продукта — это задача про голос (3.7b), а не про
// надпись.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ZONE = join(__dirname, '..', '..', 'donor')

/** Чужие каталоги переводов: их языки не предлагаются (SPEC C7), а английский
 * переписывается на лету (`debrand.ts`). */
const SKIP_FILES = new Set(['en.ts', 'ar.ts', 'ja.ts', 'zh.ts', 'zh-hant.ts', 'voice-stop-word.ts'])

const TECHNICAL = new RegExp(
  [
    'hermesDesktop',
    '@hermes/',
    'data-hermes',
    'hermes-desktop',
    'hermes\\.desktop',
    'x-hermes',
    'persist:hermes',
    'HERMES_[A-Z_]+',
    '~/\\.hermes',
    '\\.hermes/',
    '@/hermes',
    'types/hermes',
    "/hermes'",
    'use-hermes-config',
    'hermes-boot',
    'Hermes[A-Z][A-Za-z]*', // их типы: HermesGitBranch, HermesReviewFile, …
    'hermes-agent',
    'hermes:[a-z-]', // события окна: hermes:composer-submit, …
    'hermes/work-',
    'hermes-config',
    'hermes-not-found',
    '__hermes_empty__',
    'hermes-terminal',
    'cc-update-hermes',
    'hermes-skill-pick',
    'hermes-(ig|tt|tw)-embed',
    'hermes-inline-preview',
    'window\\.hermes=', // имя API внутри изолированной рамки живого блока
    'cm-hermes',
    'hermes-onboarding',
    'hermes-zone-fade',
    'hermes\\.plugin\\.',
    'hermes-media://',
    '/api/hermes/',
    'hermes update', // команда их CLI на экране обновлений (HX4)
    'hermes-update',
    'notifications\\.updateHermes', // ключ каталога, а не текст
    "^'hermes'$" // псевдоним основного профиля и слово для поиска в палитре
  ].join('|')
)

const LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
      continue
    }
    if (!/\.tsx?$/.test(entry) || SKIP_FILES.has(entry)) continue
    out.push(path)
  }
  return out
}

/** Литералы строки кода. Строки комментариев отбрасываются целиком — разбирать
 * их синтаксически ради этой проверки незачем. */
function literalsOfLine(line: string): string[] {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return []
  return line.match(LITERAL) ?? []
}

describe('в коде их экранов нет их имени на виду (SPEC C12)', () => {
  it('ни один строковый литерал зоны донора не называет их продукт', () => {
    const offenders: string[] = []

    for (const file of sourceFiles(ZONE)) {
      const lines = readFileSync(file, 'utf-8').split(/\r?\n/)

      lines.forEach((line, index) => {
        for (const literal of literalsOfLine(line)) {
          if (!/hermes/i.test(literal)) continue
          if (TECHNICAL.test(literal)) continue
          offenders.push(`${file.slice(ZONE.length + 1)}:${index + 1} ${literal}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
