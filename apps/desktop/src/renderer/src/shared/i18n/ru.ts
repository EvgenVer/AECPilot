// Russian catalog for the donor's own strings (SPEC C7: the UI is en + ru).
//
// `debrandedEnBase` merges these over OUR English catalog, so this file is a
// PARTIAL: a key that is not here falls back to English, type-checked against
// their `Translations` contract. The base is ours and not theirs on purpose —
// an untranslated key must fall back to a string that does not name their
// product (`debrand.ts`). That is deliberate — their catalog is ~2900
// lines written for screens that arrive across tasks 1.8.9–1.8.15, and
// translating a string before its screen exists means translating it blind.
// The full pass is task 6.7 ("i18n polish across every screen, including the
// strings that came with the donor's code").
//
// What is here now: the strings a Russian user meets before any donor screen
// is mounted — the language picker itself and the shared shell vocabulary.

import { debrandedEnBase } from './locale-base'

export const ru = debrandedEnBase({
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
  },
  // Подсказки-ротация (задача 3.B3е). Переведены целиком, а не отложены до
  // общего прохода 6.7, потому что показываются они САМИ, без всякого действия
  // человека, — то есть это одна из немногих поверхностей, которую русский
  // пользователь встретит, ничего специально не открывая.
  //
  // Каталог просмотрен поимённо, все десять якорей сверены. Пять из них
  // (`sidebar-nav-*`) собираются на ходу из `item.id`, поэтому искать их
  // строкой бесполезно — сверялись по списку строк боковой панели
  // (`sidebar/index.tsx`, id `new-session`/`skills`/`messaging`/`artifacts`/
  // `cron`) и по их маршрутам в `routes.ts`; остальные пять лежат в разметке
  // литералами. Снимать не понадобилось ничего.
  //
  // Если экран когда-нибудь уйдёт из объёма, править каталог всё равно не
  // придётся: подсказка, чей якорь не нашёлся в DOM, просто не участвует в
  // розыгрыше (`resolveTipAnchor`).
  tips: {
    close: 'Больше не показывать эту подсказку',
    items: {
      'new-session': {
        title: 'Начать с чистого листа',
        text: 'У нового чата свои контекст, терминал и рабочая папка.'
      },
      skills: {
        title: 'Научить один раз',
        text: 'Скилы — это папки с инструкциями, которые подключаются, когда работа их требует.'
      },
      messaging: {
        title: 'Не только за рабочим столом',
        text: 'Подключите Telegram, Discord, Slack и другие — тот же агент и та же память.'
      },
      artifacts: {
        title: 'Всё, что было сделано',
        text: 'Изображения, файлы и ссылки из всех сессий, собранные в одном месте.'
      },
      cron: {
        title: 'Работа, которая идёт сама',
        text: 'Запускайте запрос раз в час, раз в сутки или по выражению cron.'
      },
      'command-palette': {
        title: 'Одно поле для всего',
        text: 'Сессии, настройки, скилы и команды — всё отвечает палитре.'
      },
      profiles: {
        title: 'Профили не пересекаются',
        text: 'У каждого свои ключи, своя память и свои сессии.'
      },
      'composer-mentions': {
        title: 'Приложить и скомандовать',
        text: 'Наберите @, чтобы принести файл в разговор, и /, чтобы выполнить команду.'
      },
      'model-switch': {
        title: 'Сменить модель посреди ветки',
        text: 'Название модели — это кнопка. Меняйте, когда работа меняет форму.'
      },
      'right-pane': {
        title: 'Рабочая панель',
        text: 'Файлы, терминал, просмотр правок и встроенный браузер делят правую сторону.'
      }
    }
  }
})
