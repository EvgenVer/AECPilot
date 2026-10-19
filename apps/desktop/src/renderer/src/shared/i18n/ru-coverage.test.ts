// Гейт покрытия русского каталога (задачи T20.8, T27).
//
// Их `ru.ts` собран поверх английского: непереведённая строка не падает, а
// молча показывает английскую. После подъёма на 0.22.2 таких было 1278 из 5100.
// Гейт держит два списка и требует, чтобы КАЖДАЯ строка, совпадающая с
// английской, попадала в один из них:
//   EXCLUDED — поверхность вне продукта (номер исключения из SPEC) или не
//              показывается вовсе (член моста отсутствует, вызова нет);
//   NAMES    — имена, адреса и примеры, которые не переводятся.
// Третьего списка («переведём позже») нет с T27: большие страницы настроек
// переведены в `ru-fill-pages.ts`, и новая английская строка на любом экране
// роняет гейт. Перевести в `ru-fill.ts` / `ru-fill-pages.ts` или обосновать здесь.

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

const NAMES = new Set([
  'connectorsPage.add.pastePlaceholder',
  'connectorsPage.add.typeHttp',
  'connectorsPage.add.authOauth',
  'settings.customEndpoints.namePlaceholder',
  'settings.plugins.installModal.repoPlaceholder',
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

describe('русский каталог не показывает английских строк ни на одном экране (T20.8, T27)', () => {
  it('сравнение вообще что-то нашло — иначе гейт пустой', () => {
    expect(english.size).toBeGreaterThan(4000)
    expect(untranslated.length).toBeGreaterThan(0)
  })

  it('каждая английская строка — исключение или имя', () => {
    const stray = untranslated
      .map(([key]) => key)
      .filter((key) => !NAMES.has(key) && !under(EXCLUDED, key))
    expect(stray, 'перевести в ru-fill.ts / ru-fill-pages.ts или обосновать в этом гейте').toEqual(
      []
    )
  })

  it('каждый пункт списков ещё что-то покрывает — мёртвый пункт скрыл бы ошибку', () => {
    const keys = untranslated.map(([key]) => key)
    const dead = [...Object.keys(EXCLUDED), ...NAMES].filter(
      (entry) => !keys.some((key) => key === entry || key.startsWith(entry))
    )
    expect(dead).toEqual([])
  })
})
