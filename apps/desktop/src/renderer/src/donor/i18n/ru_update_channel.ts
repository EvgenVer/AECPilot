/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ru_update_channel.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export const ruUpdateChannel = {
  title: 'Канал обновлений',
  description:
    'Стабильный устанавливает только опубликованные релизы. «Каждый коммит» следует за веткой main по мере изменений.',
  stable: 'Стабильные релизы',
  main: 'Каждый коммит',
  stableConfirmTitle: 'Перейти на стабильные релизы?',
  stableConfirmBody:
    'Hermes перейдёт на последний опубликованный релиз, который может быть старше текущего кода. Данные, записанные более новым кодом, могут читаться неправильно, поэтому сначала сделайте резервную копию.',
  stableConfirm: 'Перейти на стабильный',
  failed: 'Не удалось изменить канал обновлений',
  detailsLabel: 'Канал',
  branch: (b: string) => `Ветка: ${b}`,
  change: 'Изменить',
  latestRelease: (v: string) => `У вас последний стабильный релиз (${v}).`,
  rollbackTitle: (v: string) => `Вернуться к стабильному релизу ${v}`,
  rollbackBody: (v: string) => `Эта сборка новее стабильного релиза ${v}. Установка вернёт Hermes к этому релизу.`,
  rollbackAction: (v: string) => `Вернуться к ${v}`
}
