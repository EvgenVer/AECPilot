// Регистрация живых блоков в ленте (задача 3.4б, SPEC UR28).
//
// Блоки входят в их ленту той же дверью, что и вклад плагина: область
// `transcript.directives`, имя и функция отрисовки. Их разметка сама решает,
// когда звать: директива обязана занимать абзац целиком, незанятое имя остаётся
// абзацем, а бросок при отрисовке ловит их `ContribBoundary` и показывает значок
// внутри сообщения. Ничего из этого нам писать не пришлось — и ни одного
// вендорного файла для этого править не нужно.
//
// Имена — латиницей и с приставкой `aec-`: их занимает модель, а не человек,
// и приставка разводит наши блоки с их `::preview`.

import { registry } from '../../donor/contrib/registry'
import {
  TRANSCRIPT_DIRECTIVE_AREA,
  type TranscriptDirectiveContribution
} from '../../donor/lib/transcript-directives'

import { ClauseBlockView } from './ClauseBlockView'
import { ConflictBlockView } from './ConflictBlockView'
import { TableBlockView } from './TableBlockView'

/** Имена, которые агент пишет в ответе. Меняются только вместе с правилом в
 * скиле — блок под другим именем перестанет отрисовываться молча. */
export const BLOCK_NAMES = {
  clause: 'aec-clause',
  conflict: 'aec-conflict',
  table: 'aec-table'
} as const

export function registerTranscriptBlocks(): () => void {
  return registry.registerMany([
    {
      id: 'aec.transcript.table',
      area: TRANSCRIPT_DIRECTIVE_AREA,
      source: 'core',
      data: {
        name: BLOCK_NAMES.table,
        render: ({ attrs }) => <TableBlockView attrs={attrs} />
      } satisfies TranscriptDirectiveContribution
    },
    {
      id: 'aec.transcript.conflict',
      area: TRANSCRIPT_DIRECTIVE_AREA,
      source: 'core',
      data: {
        name: BLOCK_NAMES.conflict,
        render: ({ attrs }) => <ConflictBlockView attrs={attrs} />
      } satisfies TranscriptDirectiveContribution
    },
    {
      id: 'aec.transcript.clause',
      area: TRANSCRIPT_DIRECTIVE_AREA,
      source: 'core',
      data: {
        name: BLOCK_NAMES.clause,
        render: ({ attrs }) => <ClauseBlockView attrs={attrs} />
      } satisfies TranscriptDirectiveContribution
    }
  ])
}
