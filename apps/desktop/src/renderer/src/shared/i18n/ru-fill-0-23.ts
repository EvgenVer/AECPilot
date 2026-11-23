// Русские строки экранов донора, которые приехали с пином 0.23.0 (задача T52) и
// которых нет в их собственном `ru` — каталог возможностей, комнаты шлюза,
// новые коды ошибок хода, обновление плагинов. Отдельный файл, чтобы перенос
// следующего пина было видно одним местом; сливается в `ru.ts` поверх
// `ru-fill.ts` и `ru-fill-pages.ts`.
//
// Словарь наш, как во всём каталоге: «комната» вместо их «группы», «AECPilot»
// вместо их имени продукта (SPEC C12). Строки поверхностей, которых в продукте
// нет, не переводятся — они объяснены в `ru-coverage.test.ts`.

import type { Translations } from '../../donor/i18n/types'
import type { TranslationOverride } from '../hermes-shared'

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}

export const RU_FILL_023: TranslationOverride<Translations> = {
  catalog: {
    tier: 'Уровень',
    previousSlide: 'Предыдущая подборка',
    nextSlide: 'Следующая подборка',
    tierLabels: {
      official: 'Официальный',
      verified: 'Проверенный',
      community: 'Сообщество'
    },
    tiers: {
      official: {
        title: 'Официальные плагины',
        blurb: 'Созданы и поддерживаются Nous Research.'
      },
      verified: {
        title: 'Проверенные плагины',
        blurb: 'От компании, чья это интеграция, проверены Nous.'
      }
    },
    moreToExplore: 'Ещё в каталоге',
    moreToExploreBlurb: 'Небольшие разделы каталога, собранные в одном месте.',
    discoverKind: (kind: string) => `Обзор: ${kind}`,
    developer: {
      heading: 'Для разработчиков',
      title: 'Создавайте для AECPilot',
      pitch: 'Сделали инструмент, коннектор, плагин или мод?',
      pitchFollowUp: 'Хотите, но не знаете как?',
      submit: 'Отправить мод',
      docs: 'Документация разработчика'
    },
    toolsets: {
      mostUsed: 'Чаще всего',
      mostUsedBlurb: 'Наборы инструментов, к которым агент этого профиля обращается чаще всего.',
      essentials: 'Основное',
      essentialsBlurb: 'То, на чём держится большая часть работы агента.',
      toolCount: (count: number) =>
        `${count} ${plural(count, 'инструмент', 'инструмента', 'инструментов')}`,
      callCount: (count: string, calls: number) =>
        `${count} ${plural(calls, 'вызов', 'вызова', 'вызовов')}`,
      themes: {
        work: {
          label: 'Браузер, работа и автоматизация',
          blurb:
            'Управление браузером и рабочим столом, правка файлов, запуск кода и задачи по расписанию.'
        },
        create: {
          label: 'Видеть, слышать и создавать',
          blurb: 'Просмотр картинок и видео, расшифровка речи и создание медиа.'
        },
        recall: {
          label: 'Память и знания',
          blurb: 'Что агент помнит, а также навыки и история, по которым он ищет.'
        },
        connect: {
          label: 'Связи и обмен',
          blurb: 'Учётные записи, другие агенты, умный дом и поиск за пределами веба.'
        },
        more: {
          label: 'Другие инструменты',
          blurb: 'Всё остальное, что можно включить в этом профиле.'
        }
      }
    }
  },
  gatewayGroupOpen: {
    opening: 'Открываем комнату шлюза…',
    lookupFailed: 'Не удалось найти эту комнату на шлюзе. Попробуйте ещё раз.',
    missing: 'Этой комнаты шлюза больше нет.'
  },
  messaging: {
    relayLink: { title: 'Шлюз команды' }
  },
  skills: {
    plugins: {
      updateScanTitle: (name: string) => `Проверка безопасности отметила ${name}`,
      updateScanBody: (name: string, count: number) =>
        `Обновление ${name} получило оценку «осторожно» (замечаний: ${count}). Проверяется каждое обновление. Ставьте его, только если доверяете источнику:`,
      updateScanMore: (count: number) => `и ещё ${count}`,
      updateScanConfirm: 'Всё равно обновить',
      updateScanBlocked: (name: string) =>
        `Проверка безопасности заблокировала обновление ${name} (оценка «опасно»). Обойти её нельзя.`,
      updatedGit: (name: string) => `${name} обновлён до последнего коммита.`,
      settingsForm: { optional: '(необязательно)' }
    }
  },
  assistant: {
    thread: {
      errorCodes: {
        SESSION_OWNER_BUSY: {
          title: 'AECPilot занят в этом чате',
          body: 'Здесь уже идёт ход, и ваше сообщение не встало в его очередь. Ничего не отправлено. Повторите, когда ход закончится.'
        },
        SESSION_OWNER_UNCONFIRMED: {
          title: 'Сообщение, возможно, уже в очереди',
          body: 'Шлюз не подтвердил сообщение вовремя. Если оно встало в очередь, оно выполнится, когда закончится или разрешится предыдущий ход. Проверьте чат, прежде чем отправлять его снова.'
        }
      }
    }
  },
  // Ядро 0.23.3 (задача T86): обновление движка локальной модели той же сборки.
  settings: {
    localModels: {
      updateSameBuildDetail: (tag: string) =>
        `AECPilot теперь поставляет llama.cpp ${tag} вместе с нужными ему файлами. Обновление скачает движок заново; модели работают и во время загрузки.`
    }
  }
}
