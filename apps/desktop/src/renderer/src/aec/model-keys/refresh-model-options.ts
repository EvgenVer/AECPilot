// Список моделей после ключа из окна первого запуска (7.3.1, приёмка 2026-10-08).
//
// Ключ, сохранённый в их окне, доходит до ядра окружением процесса, поэтому ядро
// перезапускается — скрыто от окон (`keepConnection`, D-177). Переподключения
// окна не видят, и их кэш `model-options` (свежим он считается минуту) остаётся
// снятым ДО ключа: «Изменить» на шаге модели открывал выбор без нового
// провайдера. Их настройки ключей после записи сбрасывают этот кэш сами
// (`env-credentials.tsx`), их окно первого запуска — нет. Конец скрытого
// перезапуска главный процесс объявляет окнам событием `setup.ready`; по нему
// кэш и сбрасывается. Своё `setup.ready` ядро шлёт и на обычном старте — там
// сброс только заставит перечитать список при следующем открытии.

interface EventSource {
  on(type: 'setup.ready', handler: () => void): () => void
}

interface ModelOptionsCache {
  invalidateQueries(filters: { queryKey: readonly unknown[] }): Promise<void>
}

export function refreshModelOptionsOnSetupReady(
  bridge: EventSource,
  cache: ModelOptionsCache
): () => void {
  return bridge.on('setup.ready', () => {
    void cache.invalidateQueries({ queryKey: ['model-options'] })
  })
}
