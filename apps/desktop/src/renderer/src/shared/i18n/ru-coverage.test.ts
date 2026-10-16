// Гейт покрытия русского каталога (задача T20.8).
//
// Их `ru.ts` собран поверх английского: непереведённая строка не падает, а
// молча показывает английскую. После подъёма на 0.22.2 таких было 1278 из 5100.
// Гейт держит три списка и требует, чтобы КАЖДАЯ строка, совпадающая с
// английской, попадала в один из них:
//   EXCLUDED — поверхность вне продукта (номер исключения из SPEC) или не
//              показывается вовсе (член моста отсутствует, вызова нет);
//   PENDING  — большие страницы настроек, перевод которых — следующая задача
//              (TASKS, Proposals); их число не должно расти молча;
//   NAMES    — имена, адреса и примеры, которые не переводятся.
// Новая английская строка на обычном экране (подъём пина принёс ключ, их
// перевод отстал) роняет гейт: перевести в `ru-fill.ts` или обосновать здесь.

import { describe, expect, it } from 'vitest'

import { en as donorEn } from '../../donor/i18n/en'

import { ru } from './ru'

const EXCLUDED: Record<string, string> = {
  'settings.billing.': 'HX2 — оплата и кредиты',
  'settings.vault.': 'HX24 — хранилище логинов и карт',
  'settings.nav.vault': 'HX24',
  'prompts.vault': 'HX24',
  'freeTier.': 'HX3 — облако Nous и вход в их аккаунт',
  'assistant.thread.errorCodes.free_tier_': 'HX3',
  'assistant.thread.errorSignInFreeTier': 'HX3',
  'boot.failure.cloudDown': 'HX3',
  'shell.statusbar.toggleFreeTier': 'HX3',
  'sendDiagnostics.': 'нет поверхности: в зоне никто не зовёт эти ключи',
  'errors.sendDiagnostics': 'то же',
  'assistant.thread.errorSendDiagnostics': 'то же',
  'notifications.voice.': 'HX19 — голос',
  'composer.voiceEngine': 'HX19',
  'settings.fieldLabels.voice.': 'HX19',
  'settings.fieldLabels.stt.': 'HX19',
  'settings.fieldDescriptions.voice.': 'HX19',
  'settings.fieldDescriptions.stt.': 'HX19',
  'settings.poolLimits.': 'HX27 — пула бэкендов нет',
  'settings.gateway.keychainEncryption': 'HX20 — шифруем всегда',
  'profiles.fleet.': 'HX22 — реестр нескольких ядер',
  'boot.updateHold.': 'HX4 — их обновлятор',
  'settings.managedUpdates.': 'HX4 — ядро двигается только пином',
  'notifications.updateReadyMessageAppInstaller': 'HX4 — MSIX',
  'updates.availableBodyAppInstaller': 'HX4',
  'updates.applyingBodyAppInstaller': 'HX4',
  'updates.applyingCloseAppInstaller': 'HX4',
  'updates.checkUnknownTitleAppInstaller': 'HX4',
  'updates.checkUnknownBodyAppInstaller': 'HX4',
  'updates.versionDetailsDistributionStore': 'HX4 — Microsoft Store',
  'settings.uninstallSection.': 'не показывается: член `uninstall` отсутствует в шиме'
}

const PENDING: Record<string, string> = {
  'settings.localModels.': 'страница локальных моделей',
  'skills.plugins.': 'вкладка плагинов',
  'settings.plugins.': 'установка плагинов',
  'connectorsPage.': 'вкладка «Коннекторы» (MCP-серверы)',
  'connectors.': 'подключение аккаунтов коннекторов',
  'settings.customEndpoints.': 'свои адреса моделей',
  'profiles.remoteOverride.': 'удалённое ядро для профиля',
  'settings.toolsets.': 'наборы инструментов',
  'settings.model.': 'страница модели',
  'settings.fieldLabels.': 'подписи полей конфигурации',
  'settings.fieldDescriptions.': 'описания полей конфигурации'
}

// Сколько строк сейчас ждёт перевода в PENDING. Число может только падать:
// выросло — подъём принёс новые английские строки на эти страницы.
const PENDING_CEILING = 518

const NAMES = new Set([
  'webhooks.deliverOptions.telegram',
  'webhooks.deliverOptions.discord',
  'webhooks.deliverOptions.slack',
  'cron.deliveryLabels.telegram',
  'cron.deliveryLabels.discord',
  'cron.deliveryLabels.slack',
  'messaging.fieldCopy.MATTERMOST_URL.placeholder',
  'messaging.fieldCopy.MATRIX_HOMESERVER.placeholder',
  'messaging.fieldCopy.SIGNAL_HTTP_URL.placeholder',
  'composer.urlPlaceholder',
  'settings.appearance.installPlaceholder',
  'profiles.env'
])

function leaves(value: unknown, path = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') out.set(path, value)
  else if (typeof value === 'function') {
    try {
      const rendered = (value as (...a: unknown[]) => unknown)(2, 2, 2)
      if (typeof rendered === 'string') out.set(path, rendered)
    } catch {
      // Функция с особыми аргументами — сравнивать нечего.
    }
  } else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out)
  return out
}

// Имя продукта — не перевод: их «Hermes …» и наше «AECPilot» считаются одним.
const norm = (s: string): string =>
  s
    .replace(/Hermes (Desktop|Agent|Cloud|backend|runtime|gateway)/g, 'N')
    .replace(/Hermes|AECPilot|agent core|agent gateway/g, 'N')

const english = leaves(donorEn)
const untranslated = [...leaves(ru)].filter(([key, value]) => {
  const source = english.get(key)
  return source !== undefined && norm(source) === norm(value) && /[a-z]{3}/.test(norm(value))
})

const under = (table: Record<string, string>, key: string): boolean =>
  Object.keys(table).some((prefix) => key.startsWith(prefix))

describe('русский каталог не показывает английских строк на обычных экранах (T20.8)', () => {
  it('сравнение вообще что-то нашло — иначе гейт пустой', () => {
    expect(english.size).toBeGreaterThan(4000)
    expect(untranslated.length).toBeGreaterThan(0)
  })

  it('каждая английская строка — исключение, отложенная страница или имя', () => {
    const stray = untranslated
      .map(([key]) => key)
      .filter((key) => !NAMES.has(key) && !under(EXCLUDED, key) && !under(PENDING, key))
    expect(stray, 'перевести в ru-fill.ts или обосновать в этом гейте').toEqual([])
  })

  it('отложенных строк не стало больше', () => {
    const pending = untranslated.filter(([key]) => !under(EXCLUDED, key) && under(PENDING, key))
    expect(pending.length).toBeLessThanOrEqual(PENDING_CEILING)
  })

  it('каждый пункт списков ещё что-то покрывает — мёртвый пункт скрыл бы ошибку', () => {
    const keys = untranslated.map(([key]) => key)
    const dead = [...Object.keys(EXCLUDED), ...Object.keys(PENDING), ...NAMES].filter(
      (entry) => !keys.some((key) => key === entry || key.startsWith(entry))
    )
    expect(dead).toEqual([])
  })
})
