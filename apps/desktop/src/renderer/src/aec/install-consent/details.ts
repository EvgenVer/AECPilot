// Чем скил окажется, если его поставить (задача 3.8, SPEC UR23).
//
// Отдельный модуль, потому что это единственное место гейта, которое ходит в
// ядро: диалог остаётся чистым, а тест подменяет одну функцию вместо всего
// сетевого слоя.
//
// Читается ИМЕННО предпросмотр (`GET /api/skills/hub/preview`), а не карточка
// из списка: список рисует страница хаба, и доверять её словам о том, что
// внутри пакета, — значит спрашивать у продавца, стоит ли покупать.

import { previewSkillHub } from '../../donor/hermes'

import { requiredToolsOf } from './install-consent-pure'

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
