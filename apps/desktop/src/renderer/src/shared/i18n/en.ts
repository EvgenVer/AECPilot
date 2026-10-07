// Английский каталог интерфейса — их строки без их имени (требование владельца
// 2026-08-20; механика — `debrand.ts`).
//
// Ручные замены ниже — те места, где механическая подстановка сочинила бы
// неправду: путь на диске, команда терминала, адрес установщика, переменная
// окружения их сборки. Каждая переписана так, чтобы говорить правду о НАШЕМ
// продукте либо не называть частность вовсе.

import { en as donorEn } from '../../donor/i18n/en'
import type { Translations } from '../../donor/i18n/types'

import { debrandTranslations } from './debrand'

const OVERRIDES: Record<string, string> = {
  // Путь `~/.hermes/config.yaml` в нашей сборке неверен и без переименования:
  // профиль ядра лежит в каталоге приложения. Диалог подтверждения — экран, до
  // которого человек доходит, поэтому строка переписана, а не подставлена.
  'assistant.approval.alwaysDescription':
    'This adds the pattern to the permanent allowlist, so commands like this are not asked about again — in this session or any later one.',

  // Команда их CLI. У нас восстановление живёт на экране навыков.
  'skills.skillArchivedMessage': 'Can be restored from the skills screen.',

  // `Is \`hermes gateway\` running?` — их команда; у нас ядро поднимает само
  // приложение.
  'desktop.handoff.timedOut': 'Timed out waiting for the agent core to answer.',

  // Слэш-команда выхода.
  'composer.commandDescs./quit': 'exit the app',

  // Переменные окружения их сборки; у нас таких нет.
  'settings.gateway.envOverrideDesc':
    'A remote address set in the environment overrides the setting below. Clear it to use the saved value.',

  // Адрес их установщика — сочинять свой нельзя, а называть чужой незачем.
  'settings.gateway.sshErrNotInstalled':
    'The agent core is not installed on the remote host. Install it there, or set the path to it below.',
  'settings.gateway.sshHermesPathTitle': 'Path to the agent core (optional)',
  'settings.gateway.sshHermesPathDesc':
    'Full path to the core’s binary on the remote host. Blank = auto-detect.',

  // Примеры адресов и идентификаторов.
  'settings.gateway.remoteUrlDesc':
    'Base URL of the remote backend. Path prefixes are supported, for example /agent.',
  'install.remoteUrlPlaceholder': 'https://gateway.example.com/agent',
  'messaging.fieldCopy.MATRIX_USER_ID.placeholder': '@bot:example.org',

  // Их подсказка поиска тем обещает VS Code Marketplace — эта половина поля
  // снята правкой [3] в `appearance-settings.tsx` (HX14).
  'settings.appearance.themeSearchPlaceholder': 'Search your themes…'
}

/** Подпись под логотипом пустого чата — убрана совсем (D-181, решение владельца
 *  2026-10-07, задача 3H.23). Их компонент берёт текст из каталога, а без него —
 *  из своего английского `intro-copy.jsonl`; пустая строка в каталоге закрывает
 *  оба пути, и файлы донора не трогаются. `none` покрывает все «нейтральные»
 *  личности, `custom` — любую названную. */
export const NO_INTRO_LINE: Translations['intro'] = { stock: { none: [''] }, custom: () => [''] }

export const en = debrandTranslations({ ...donorEn, intro: NO_INTRO_LINE }, OVERRIDES)
