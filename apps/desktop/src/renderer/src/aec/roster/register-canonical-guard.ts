// «Новый чат» в постоянном чате специалиста (задача 3C.4, SPEC UR27).
//
// У специалиста один непрерывный разговор — в этом вся идея роестра. `/new`
// расколол бы его на две сессии, то есть сделал бы ровно то, чего этот чат
// обещает никогда не делать. Поэтому в НЁМ команда подменяется на `/compact`:
// ощущение то же (свежий рабочий контекст), а переписка остаётся одна. Человеку
// об этом говорится — молчаливая подмена команды была бы хуже самой проблемы.
//
// В ОБЫЧНОЙ сессии того же специалиста `/new` работает как везде: отнять
// возможность начать с чистого листа мы не вправе.
//
// ГДЕ СТОИТ ПЕРЕХВАТ. В их же шве для этого — посреднике композера
// (`composer.middleware`), а не правкой их файла: правка вендорного кода умерла
// бы при следующем переносе, а шов переживёт его. Их плагин делает то же самое
// и в том же месте.

import { registry } from '../../donor/contrib/registry'
import { COMPOSER_AREAS } from '../../donor/app/chat/composer/contrib'
import { $activeSessionId } from '../../donor/store/session'
import { notify } from '../../donor/store/notifications'
import { rerouteNewInCanonicalChat } from '../../../../main/canonical-chat-pure'

/** Привязки «специалист → его постоянный чат», обновляются вместе с роестром.
 * Держатся здесь, а не спрашиваются у главного процесса на каждую отправку:
 * посредник стоит на горячем пути, и лишний обход IPC перед каждым сообщением
 * — это задержка там, где её никто не ждёт. */
let canonicalChats: string[] = []

export function setCanonicalChats(sessionIds: readonly string[]): void {
  canonicalChats = sessionIds.filter((id) => id !== '')
}

export function registerCanonicalChatGuard(): () => void {
  return registry.register({
    id: 'aec-canonical-chat-guard',
    area: COMPOSER_AREAS.middleware,
    source: 'core',
    data: {
      handler: (draft: { text: string }) => {
        const active = $activeSessionId.get() ?? ''
        const canonical = canonicalChats.find((id) => id === active) ?? ''
        const replacement = rerouteNewInCanonicalChat(draft.text, active, canonical)

        if (replacement === null) return draft

        notify({
          kind: 'info',
          title: 'Этот чат не начинается заново',
          message:
            'У специалиста один непрерывный разговор — вместо нового чата очищаю рабочий ' +
            'контекст. Для разового разговора с ним заведите обычную сессию.'
        })

        return { ...draft, text: replacement }
      }
    }
  })
}
