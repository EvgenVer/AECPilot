// Перезагрузка окна после «Начать» в их окне подключения провайдера (приёмка
// 2026-10-08, решение владельца — перезагрузка с нашей стороны, без правки донора).
//
// «Начать» запускает их растворение окна (`leaving`), и этот флаг их окно больше
// не сбрасывает: компонент не размонтируется, а лишь перестаёт рисоваться. Когда
// окно открывают снова — вход по подписке из «Настройки → Провайдеры» или
// «Добавить провайдера», — оно рисуется прозрачным и пропускает щелчки насквозь:
// код для браузера выдан, но его не видно, а закрытие отменяет вход. Шаг «Начать»
// у ключа вернули правки D-177 и D-188, отсюда и поломка. Файл донора эту правку
// не допускает (AGENTS §14), поэтому после «Начать» окно один раз перезагружается
// — состояние их окна начинается заново.
//
// Признак «Начать» — их `completeDesktopOnboarding` сразу после шага подтверждения
// модели: из этого шага он зовётся только по «Начать».

interface OnboardingState {
  configured: boolean | null
  manual: boolean
  flow: { status: string }
}

interface Store<T> {
  get(): T
  listen(listener: (value: T) => void): () => void
}

export function finishedWithBegin(previous: OnboardingState, next: OnboardingState): boolean {
  return (
    previous.flow.status === 'confirming_model' &&
    next.flow.status === 'idle' &&
    next.configured === true &&
    !next.manual
  )
}

export function reloadAfterBegin(store: Store<OnboardingState>, reload: () => void): () => void {
  let previous = store.get()
  return store.listen((next) => {
    const begun = finishedWithBegin(previous, next)
    previous = next
    // Пауза — чтобы их обработчик завершения успел записать свой кэш
    // «настроено» в хранилище окна до перезагрузки.
    if (begun) setTimeout(reload, 300)
  })
}
