// Task T76 (UR55): the arithmetic of the continuous PDF strip, without pdf.js
// and without the DOM, so each rule is pinned by a test.

/** Ступени масштаба. Ряд, а не свободное число: «+» и Ctrl+колесо дают
 *  предсказуемый шаг, а 100% и 200% попадают точно. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** Следующая ступень от текущего масштаба: `direction` 1 — крупнее, -1 — мельче.
 *  От «по ширине» (произвольный масштаб) — ближайшая ступень в ту сторону. */
export function nextZoomStep(from: number, direction: 1 | -1): number {
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > from + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < from - 0.001) ?? ZOOM_STEPS[0]
}

/** Номер страницы (с 1), на которую приходится отметка `offset` ленты: последняя
 *  страница, чей верх не ниже отметки. `tops` — верх каждой страницы по порядку. */
export function pageAtOffset(tops: readonly number[], offset: number): number {
  let page = 1
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index] <= offset) page = index + 1
    else break
  }
  return page
}
