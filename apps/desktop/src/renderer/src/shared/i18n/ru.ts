// Russian catalog for the donor's own strings (SPEC C7: the UI is en + ru).
//
// `defineLocale` merges these over their English catalog, so this file is a
// PARTIAL: a key that is not here falls back to English, type-checked against
// their `Translations` contract. That is deliberate — their catalog is ~2900
// lines written for screens that arrive across tasks 1.8.9–1.8.15, and
// translating a string before its screen exists means translating it blind.
// The full pass is task 6.7 ("i18n polish across every screen, including the
// strings that came with the donor's code").
//
// What is here now: the strings a Russian user meets before any donor screen
// is mounted — the language picker itself and the shared shell vocabulary.

import { defineLocale } from '../../donor/i18n/define-locale'

export const ru = defineLocale({
  common: {
    apply: 'Применить',
    back: 'Назад',
    cancel: 'Отмена',
    close: 'Закрыть',
    confirm: 'Подтвердить',
    continue: 'Продолжить',
    copy: 'Копировать',
    delete: 'Удалить',
    done: 'Готово',
    error: 'Ошибка',
    failed: 'Не удалось',
    loading: 'Загрузка…',
    refresh: 'Обновить',
    remove: 'Убрать',
    retry: 'Повторить',
    save: 'Сохранить',
    saving: 'Сохранение…',
    on: 'вкл',
    off: 'выкл'
  },
  language: {
    label: 'Язык интерфейса',
    description: 'Язык интерфейса приложения.'
  }
})
