// Чем скил окажется, если его поставить (задача 3.8, SPEC UR23).
//
// Отдельный модуль, потому что это единственное место гейта, которое ходит в
// ядро: диалог остаётся чистым, а тест подменяет одну функцию вместо всего
// сетевого слоя.
//
// Читается ИМЕННО предпросмотр (`GET /api/skills/hub/preview`), а не карточка
// из списка: список рисует страница хаба, и доверять её словам о том, что
// внутри пакета, — значит спрашивать у продавца, стоит ли покупать.

import { getMcpCatalog, previewSkillHub } from '../../donor/hermes'

import { type CatalogLaunch, catalogLaunchOf, requiredToolsOf } from './install-consent-pure'

export interface SkillDetails {
  name: string
  description: string
  source: string
  trustLevel: string
  /** Инструменты, которые скил просит у агента (UR23). */
  tools: string[]
  /** Сколько файлов приедет — размер того, чего человек не увидит. */
  fileCount: number
}

export async function loadSkillDetails(identifier: string): Promise<SkillDetails> {
  const preview = await previewSkillHub(identifier)

  return {
    name: preview.name || identifier,
    description: preview.description ?? '',
    source: preview.source ?? '',
    trustLevel: preview.trust_level ?? '',
    tools: requiredToolsOf(preview.skill_md),
    fileCount: Array.isArray(preview.files) ? preview.files.length : 0
  }
}

/** How a catalog MCP server starts, read from the core's catalog (task T55). Throws when
 *  the core does not list the entry: the dialog then says so, and still asks. */
export async function loadMcpCatalogDetails(name: string): Promise<CatalogLaunch> {
  const catalog = await getMcpCatalog()
  const entry = catalog.entries.find((item) => item.name === name)
  if (!entry) throw new Error(`MCP catalog has no entry "${name}"`)
  return catalogLaunchOf(entry)
}
