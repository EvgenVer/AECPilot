// Задача 3E.24 (SPEC UR36, замечание D-74): рука агента попадает в цель при
// любом масштабе интерфейса.
//
// ЧТО СЛОМАНО И ЧЬЁ. Их `preview-input.ts` утверждает прямым текстом:
// «Coordinates are relative to the webview, and the webview IS the guest
// viewport — so a rect the act engine measured inside the page needs no
// conversion on the way back out». Это верно ровно при масштабе 100 %. Движок
// нажатий меряет прямоугольник в CSS-пикселях ГОСТЯ, а `sendInputEvent` у
// `<webview>` принимает точку в пикселях, в которых фрейм этот гость рисует, —
// между ними стоит множитель зума окна. Их же код это знает: путь контекстного
// меню в `preview-pane.tsx` делит `params.x` на `zoom.factor()` и хранит там
// живой замер «zoom 0.9: (901, 272) пришло как (811, 246)». Во входном пути
// этого умножения просто нет (замер D-74: при 0.9 нажатие по кнопке `#go`
// приходило в корень документа, а панель отвечала `success: true`).
//
// ПОЧЕМУ ПОПРАВКА ЖИВЁТ ЗДЕСЬ, А НЕ В ИХ ФАЙЛЕ. Умножение координат не входит в
// пять разрешённых правок зоны (AGENTS §14), и правка на месте исчезла бы при
// следующем переносе донора. Их файл делает ровно одну разрешённую вещь —
// регистрирует в таблице входных каналов НАШУ обёртку вместо своего канала
// (правка [3]), а вся арифметика стоит тут.
//
// НАПРАВЛЕНИЕ ЗАМЕРЕНО, А НЕ ВЫВЕДЕНО. e2e при 125 % сначала был написан и
// УРОНЕН на неисправленном пути (эхо страницы не появилось), и только потом
// закрыт умножением. Контрольная мутация — убрать умножение — валит его снова.

import type {
  PreviewInputEvent,
  PreviewInputHandle
} from '../../donor/app/chat/right-rail/preview-input'

/** Множитель зума окна. Спрашивается у Chromium в МОМЕНТ нажатия: человек мог
 * нажать Ctrl+= секунду назад, а закэшированное значение промахнулось бы так же,
 * как промахивалась единица. Единица — честный запас на случай, когда моста нет
 * (окно без нашего preload: тогда поведение ровно донорское). */
function zoomFactor(): number {
  const factor = window.aecpilot?.zoomFactor?.()

  return typeof factor === 'number' && factor > 0 ? factor : 1
}

/** Есть ли у события точка. У клавиатурных её нет, и придумывать её нельзя. */
function hasPoint(event: PreviewInputEvent): event is Extract<PreviewInputEvent, { x: number }> {
  return 'x' in event && 'y' in event
}

/** То же событие в пикселях, которые принимает `sendInputEvent`. */
export function scaleEvent(event: PreviewInputEvent, factor: number): PreviewInputEvent {
  if (factor === 1 || !hasPoint(event)) {
    return event
  }

  // Округление — не косметика: `sendInputEvent` принимает целые пиксели, и
  // дробная точка сделала бы попадание зависящим от того, как её усечёт
  // Chromium. Округляем сами, чтобы решение было наше и видимое.
  return { ...event, x: Math.round(event.x * factor), y: Math.round(event.y * factor) }
}

/** Их входной канал, пересчитывающий координаты под текущий масштаб окна. */
export function scaledPreviewInput(handle: PreviewInputHandle): PreviewInputHandle {
  return {
    focus: handle.focus,
    send: (event) => handle.send(scaleEvent(event, zoomFactor()))
  }
}
