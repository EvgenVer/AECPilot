/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ru_plural.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Shared by ru.ts and its sibling overlays.
// RU_PLURAL: (count, one, few, many) — русские формы сущ. падежа
// RU_NOUN: (count, one, few, many) — формы род. множественного
// count может быть number или string (часть подписей en.ts передаёт строки)
const ruNum = (count: number | string) => (typeof count === 'string' ? Number(count) || 0 : count)

export const RU_PLURAL = (count: number | string, one: string, few: string, many: string) => {
  const c = ruNum(count)
  const n = Math.abs(c) % 10
  const nn = Math.abs(c) % 100

  return n === 1 && nn !== 11 ? one : n >= 2 && n <= 4 && (nn < 12 || nn > 14) ? few : many
}

export const RU_NOUN = (count: number | string, one: string, few: string, many: string) => {
  const c = ruNum(count)
  const n = Math.abs(c) % 10
  const nn = Math.abs(c) % 100

  return n === 1 && nn !== 11 ? one : n >= 2 && n <= 4 && (nn < 12 || nn > 14) ? few : many
}
