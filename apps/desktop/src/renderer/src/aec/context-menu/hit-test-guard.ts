// Правый клик: факты Chromium доезжают до меню (задача 3F.5, D-96, SPEC UR37).
//
// ЧТО ЛОМАЛОСЬ. Меню рисует окно (их `AppContextMenu`), а слово с ошибкой,
// подсказки замены и координаты картинки знает только Chromium — он отдаёт их
// главному процессу событием `context-menu`, и наш мост пересылает «поздние
// факты» в их меню. Chromium собирает эти факты hit-test'ом В ТОЧКЕ КЛИКА уже
// ПОСЛЕ того, как отработали DOM-слушатели `contextmenu`. Их слушатель открывает
// меню синхронно (nanostores → `useSyncExternalStore` → синхронный рендер для
// дискретного события), и угол меню ложится ровно под курсор. Hit-test попадает
// в меню: `isEditable: false`, `misspelledWord: ""`, `mediaType: "none"`,
// картинка и ссылка не распознаны. Факты не приходят никогда, «копировать
// картинку» копирует пустоту. Замерено 19–20.09.2026 (автоприёмка, позиции
// 50.2.1/50.3.1): то же меню, вставленное на следующем тике или в стороне от
// курсора, факты не крадёт — 16 зондов, воспроизведено в чистом окне.
//
// ЧТО ДЕЛАЕТСЯ. Чужое событие (настоящий жест) останавливается здесь, до их
// слушателя, и НЕ отменяется: действие по умолчанию у Chromium — тот самый
// hit-test — идёт по пустому месту, факты уезжают в главный процесс. Через
// паузу то же событие проигрывается заново (копия на той же цели), и их
// слушатель открывает меню как раньше. Своя копия узнаётся по списку, а не по
// `isTrusted`: тот в jsdom не подделать, а правило то же — насквозь идёт только
// то, что выпустили мы сами. Если факты успели прийти до этого,
// они вкладываются в открытое меню их же `augmentSpellcheck` (её собственная
// подписка их отбросила: меню тогда ещё не было); если придут позже — их
// подписка справится сама. Пауза в 30 мс глазом не видна, а IPC туда-обратно
// укладывается в единицы миллисекунд.
//
// Слушатель ставится из тела `main.tsx`, до первого рендера: слушатели одной
// цели зовутся в порядке подписки, и наш обязан быть первым — иначе их меню
// снова встанет под курсор до hit-test'а.

import { augmentSpellcheck } from '../../donor/app/context-menu/store'

/** Через сколько проиграть жест заново: hit-test уже прошёл, факты в пути. */
const REPLAY_AFTER_MS = 30

interface SpellcheckFacts {
  misspelledWord: string
  suggestions: string[]
}

/** Возвращает функцию снятия — для тестов и симметрии. */
export function installContextMenuHitTestGuard(): () => void {
  // Факты последнего жеста. Обнуляются на каждом настоящем клике: подсказки
  // прошлого слова не должны попасть в меню следующего.
  let facts: SpellcheckFacts | null = null
  const replays = new WeakSet<Event>()

  const stopFacts = window.aecpilot.onContextMenuSpellcheck((payload) => {
    facts = payload
  })

  const onContextMenu = (event: MouseEvent): void => {
    // Наша же копия: идёт дальше, к их слушателю.
    if (replays.has(event)) return

    event.stopImmediatePropagation()
    facts = null

    const target = event.target
    if (!target) return
    const replay = new MouseEvent('contextmenu', event)
    replays.add(replay)

    window.setTimeout(() => {
      target.dispatchEvent(replay)
      if (facts) augmentSpellcheck(facts)
    }, REPLAY_AFTER_MS)
  }

  window.addEventListener('contextmenu', onContextMenu, true)

  return () => {
    window.removeEventListener('contextmenu', onContextMenu, true)
    stopFacts()
  }
}

/** Селектор их поля ввода: `RICH_INPUT_SLOT` в `composer/rich-editor.ts`. */
const COMPOSER_INPUT = '[data-slot="composer-rich-input"]'

/**
 * Проверка орфографии в поле ввода (та же D-96, вторая половина).
 *
 * Их композер ставит `spellCheck={false}` — у них подчёркивания в чате нет
 * по замыслу. У нас чек-лист (блок 50, шаг 3) и UR37 требуют подчёркивание
 * опечатки именно в поле ввода, а без атрибута Chromium не проверяет текст
 * вовсе, и никакие факты в меню не приходят. Атрибут включается после
 * монтирования: React выставляет его один раз и больше не трогает, пока
 * значение свойства не изменится — а оно не меняется. Оба словаря (ru, en-US)
 * включены главным процессом, так что английский термин в русской фразе не
 * подчёркивается.
 */
export function enableComposerSpellcheck(): () => void {
  const enable = (): void => {
    for (const input of document.querySelectorAll(`${COMPOSER_INPUT}:not([spellcheck="true"])`)) {
      input.setAttribute('spellcheck', 'true')
    }
  }

  const observer = new MutationObserver(enable)
  observer.observe(document, { childList: true, subtree: true })
  enable()

  return () => observer.disconnect()
}
