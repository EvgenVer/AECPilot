// Находка 2026-10-21: копия профиля автотестов везла регистрации MCP-серверов,
// смотрящие в профиль ручной приёмки, в проект человека и в дом ядра. Модуль —
// обвязка e2e (`e2e/lib/profile-mcp.ts`), а тест живёт здесь, потому что
// `e2e/**` исключён из прогона vitest (`vitest.config.ts`).
//
// Пути в образце выдуманные, форма блока — ровно та, что пишет
// `runtime/register-aec-*.mjs::mergeMcpServerIntoConfigYaml`.

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findForeignPaths, isolateProfileMcp } from '../../e2e/lib/profile-mcp'

const REPO = 'D:\\work\\AECPilot'
const PROFILE = 'C:\\Users\\tester\\AppData\\Local\\Temp\\aecpilot-acceptance-profile-x1'
const SKILLS_COPY = `${PROFILE}\\aec-shipped-skills`
const json = (value: string): string => JSON.stringify(value)

const HEAD = [
  'model:',
  '  default: some-model',
  'skills:',
  '  external_dirs:',
  `    - ${SKILLS_COPY}`,
  'plugins:',
  '  enabled:',
  '    - a2a-platform',
  '_config_version: 32'
]

const TAIL = ['platforms:', '  ntfy:', '    enabled: false', 'web:', '  backend: none']

const PROJECT = 'C:\\Users\\tester\\Documents\\ПроектB\\.aecpilot\\project.json'
const DEV = `${REPO}\\runtime\\dev-profile`
const HERMES = `${REPO}\\runtime\\.hermes-venv\\Scripts\\hermes.exe`

const MCP = [
  'mcp_servers:',
  '  aec-sources:',
  `    command: ${json(`${REPO}\\.venv\\Scripts\\aec-sources.exe`)}`,
  `    args: ${JSON.stringify(['--project', PROJECT])}`,
  '    enabled: true',
  '  aec-rag:',
  `    command: ${json(`${REPO}\\.venv\\Scripts\\aec-rag.exe`)}`,
  `    args: ${JSON.stringify(['serve', '--project', PROJECT])}`,
  '    env:',
  '      AEC_RAG_BASE_URL: "https://provider.example/v1/"',
  '      AEC_RAG_EMBEDDING_MODEL: "embed-model"',
  '      AEC_RAG_PROVIDER_REF: "FAKE_PROVIDER_VAR"',
  '      FAKE_PROVIDER_VAR: "${env:FAKE_PROVIDER_VAR}"',
  `      AEC_HERMES_HOME: ${json(DEV)}`,
  '    enabled: true',
  '  aec-roster:',
  `    command: ${json(`${REPO}\\.venv\\Scripts\\aec-roster.exe`)}`,
  `    args: ${JSON.stringify(['--roster', `${DEV}\\aecpilot-roster.json`, '--hermes', HERMES, '--home', DEV])}`,
  '    enabled: true'
]

const CONFIG = [...HEAD, ...MCP, ...TAIL].join('\n') + '\n'

/** Корни, внутри которых копии можно всё: сама копия и два venv репозитория. */
const ALLOWED = [PROFILE, `${REPO}\\.venv`, `${REPO}\\runtime\\.hermes-venv`]

const FORBIDDEN = ['runtime\\dev-profile', 'appdata\\local\\hermes', 'documents']

function flatten(text: string): string {
  return text.replace(/\\+/g, '\\').toLowerCase()
}

describe('isolateProfileMcp', () => {
  it('убирает проектные серверы и переводит aec-roster в копию', () => {
    const { text, changes } = isolateProfileMcp(CONFIG, PROFILE)

    expect(text).not.toContain('aec-sources')
    expect(text).not.toContain('aec-rag')
    expect(text).not.toContain('FAKE_PROVIDER_VAR')
    const expectedArgs = [
      '--roster',
      join(PROFILE, 'aecpilot-roster.json'),
      '--hermes',
      HERMES,
      '--home',
      PROFILE
    ]
    // Ровно та строка, которую записал бы `register-aec-roster.mjs` для этого
    // дома, — значит приложение, подключившись, не увидит что менять.
    expect(text).toContain(
      [
        'mcp_servers:',
        '  aec-roster:',
        `    command: ${json(`${REPO}\\.venv\\Scripts\\aec-roster.exe`)}`,
        `    args: ${JSON.stringify(expectedArgs)}`,
        '    enabled: true',
        'platforms:'
      ].join('\n')
    )
    expect(changes).toHaveLength(3)
    for (const forbidden of FORBIDDEN) expect(flatten(text)).not.toContain(forbidden)
    expect(findForeignPaths(text, ALLOWED)).toEqual([])
  })

  it('не трогает остальные ключи', () => {
    const { text } = isolateProfileMcp(CONFIG, PROFILE)
    const lines = text.split('\n')
    expect(lines.slice(0, HEAD.length)).toEqual(HEAD)
    expect(lines.slice(-TAIL.length - 1, -1)).toEqual(TAIL)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('повторный вызов ничего не меняет', () => {
    const once = isolateProfileMcp(CONFIG, PROFILE).text
    expect(isolateProfileMcp(once, PROFILE)).toEqual({ text: once, changes: [] })
  })

  it('сохраняет CRLF нетронутых строк', () => {
    const crlf = CONFIG.replace(/\n/g, '\r\n')
    const { text } = isolateProfileMcp(crlf, PROFILE)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
    expect(text.startsWith(HEAD.join('\r\n'))).toBe(true)
    expect(text.endsWith(TAIL.join('\r\n') + '\r\n')).toBe(true)
  })

  it('разбирает блочный список args, как его пишет само ядро', () => {
    const yamlDump = [
      ...HEAD,
      'mcp_servers:',
      '  aec-roster:',
      `    command: '${REPO}\\.venv\\Scripts\\aec-roster.exe'`,
      '    args:',
      '    - --roster',
      `    - ${DEV}\\aecpilot-roster.json`,
      '    - --hermes',
      `    - '${HERMES}'`,
      '    - --home',
      `    - ${DEV}`,
      '    enabled: true',
      ...TAIL
    ].join('\n')
    const { text } = isolateProfileMcp(yamlDump, PROFILE)
    expect(text).toContain(
      `    args: ${JSON.stringify(['--roster', join(PROFILE, 'aecpilot-roster.json'), '--hermes', HERMES, '--home', PROFILE])}\n    enabled: true`
    )
    expect(findForeignPaths(text, ALLOWED)).toEqual([])
  })

  it('убирает aec-roster, если его запись не разобрать', () => {
    const odd = [...HEAD, 'mcp_servers:', '  aec-roster: {command: x}', ...TAIL].join('\n')
    const { text, changes } = isolateProfileMcp(odd, PROFILE)
    expect(text).toBe([...HEAD, ...TAIL].join('\n'))
    expect(changes.join(' ')).toContain('не разобрана')
  })

  it('оставляет чужие серверы на месте — их ловит сторож', () => {
    const other = [
      ...HEAD,
      ...MCP,
      '  someone-else:',
      `    command: ${json('C:\\Users\\tester\\AppData\\Local\\hermes\\bin\\tool.exe')}`,
      ...TAIL
    ].join('\n')
    const { text } = isolateProfileMcp(other, PROFILE)
    expect(text).toContain('someone-else')
    expect(findForeignPaths(text, ALLOWED)).toEqual([
      {
        line: HEAD.length + 7,
        path: 'C:\\\\Users\\\\tester\\\\AppData\\\\Local\\\\hermes\\\\bin\\\\tool.exe'
      }
    ])
  })

  it('без секции mcp_servers возвращает текст как есть', () => {
    const plain = [...HEAD, ...TAIL].join('\n') + '\n'
    expect(isolateProfileMcp(plain, PROFILE)).toEqual({ text: plain, changes: [] })
  })

  it('отказывается от однострочной mcp_servers', () => {
    expect(() => isolateProfileMcp('mcp_servers: {aec-rag: {command: x}}\n', PROFILE)).toThrow(
      /одну строку/
    )
  })
})

describe('findForeignPaths', () => {
  it('находит все чужие пути исходного блока', () => {
    const found = findForeignPaths(CONFIG, ALLOWED).map((item) => flatten(item.path))
    expect(found).toEqual([
      flatten(PROJECT),
      flatten(PROJECT),
      flatten(DEV),
      flatten(`${DEV}\\aecpilot-roster.json`),
      flatten(DEV)
    ])
  })

  it('не путает адрес https:// и соседний каталог с разрешённым', () => {
    const text = [
      'a: "https://example.com/v1/"',
      `b: ${PROFILE}-other\\x`,
      `c: ${PROFILE}`,
      `d: "${PROFILE.replace(/\\/g, '/')}/sub"`
    ].join('\n')
    expect(findForeignPaths(text, ALLOWED)).toEqual([{ line: 2, path: `${PROFILE}-other\\x` }])
  })

  it('UNC и ссылки на дом — чужие всегда', () => {
    const text = ['a: \\\\server\\share\\x', 'b: ~/.hermes', 'c: "%LOCALAPPDATA%\\hermes"'].join(
      '\n'
    )
    expect(findForeignPaths(text, ALLOWED).map((item) => item.line)).toEqual([1, 2, 3])
  })
})
