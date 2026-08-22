// Подсказка `@имя` в поле ввода (задача 3C.7, SPEC UR27).
//
// Обращение к специалисту начинается с того, что его надо вспомнить. Подсказка
// показывает роестр по первым буквам — и это единственная часть обращения,
// которая ни от чего не зависит: подставить имя в текст можно всегда, даже пока
// сама передача вопроса ещё решается (см. `specs/agent-roster.md` §Р6 и открытый
// вопрос О-Р4).
//
// Стоит в их шве для этого (`composer.atCompletions`), а не правкой их файла:
// правка вендорного кода умерла бы при следующем переносе.

import { registry } from '../../donor/contrib/registry'
import { COMPOSER_AREAS } from '../../donor/app/chat/composer/contrib'
import {
  mentionCompletions,
  mentionHandle,
  type MentionCandidate
} from '../../../../main/mentions-pure'

/** Роестр для подсказки. Держится здесь: источник зовут на каждое нажатие после
 * паузы, и обход IPC на каждую букву — это задержка в поле ввода. */
let candidates: MentionCandidate[] = []
let activeHandle = ''

export function setMentionRoster(roster: readonly MentionCandidate[], active: string): void {
  candidates = [...roster]
  activeHandle = active
}

export function registerMentionCompletions(): () => void {
  return registry.register({
    id: 'aec-roster-mentions',
    area: COMPOSER_AREAS.atCompletions,
    source: 'core',
    // Выше файловых совпадений: когда человек набирает `@см`, он почти всегда
    // зовёт специалиста, а не ищет файл с таким именем.
    order: -100,
    data: {
      provide: (query: string) =>
        mentionCompletions(candidates, query, activeHandle).map((candidate) => ({
          insert: `@${mentionHandle(candidate)}`,
          display: mentionHandle(candidate),
          meta:
            candidate.device === '' ? candidate.role : `${candidate.role} · ${candidate.device}`,
          icon: 'person'
        }))
    }
  })
}
