// Три вызова, которыми мастер первого запуска дотягивается до чужих экранов
// (task 3.20). Отдельным модулем, а не импортом внутри компонента: их стор
// онбординга тянет за собой весь их клиент шлюза, и в тесте нашего экрана это
// была бы минута импорта ради двух функций (урок D-31).

import { requestComposerFocus, requestComposerInsert } from '../../donor/app/chat/composer/focus'
import { $desktopOnboarding, startManualOnboarding } from '../../donor/store/onboarding'

/** Открывает ИХ оверлей подключения провайдера — тот же, что поднимается сам,
 * когда ядру нечем отвечать. Нужен для случая, когда человек на первом запуске
 * нажал «выберу позже»: их оверлей после этого не возвращается, и без этой
 * кнопки шаг «ключ» стал бы тупиком. */
export function openProviderSetup(): void {
  startManualOnboarding()
}

/** Ключ и модель настраиваются на их экране, и о его успехе мы узнаём только
 * отсюда: когда их проверка готовности переключилась в «настроено», наши факты
 * пора перечитать. */
export function onProviderConfigured(callback: () => void): () => void {
  let last = $desktopOnboarding.get().configured
  return $desktopOnboarding.subscribe((state) => {
    if (state.configured === last) return
    last = state.configured
    if (state.configured) callback()
  })
}

/** Кладёт подсказанный вопрос в их поле ввода. Отправляет человек сам: сессия
 * принадлежит их экрану, и отправить за него значило бы завести вторую точку,
 * из которой в ту же сессию уходят сообщения.
 *
 * D-116: через их шину вставки, которую слушает само поле. Раньше здесь был их
 * атом `$composerDraft` — с пина 0.21 его не читает ни одно поле, и кнопка
 * молча ничего не делала. */
export function fillComposer(text: string): void {
  requestComposerInsert(text, { target: 'main' })
  requestComposerFocus('main')
}
