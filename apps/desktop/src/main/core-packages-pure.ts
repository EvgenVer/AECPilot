// Задача T20.10 (ядро 0.22.2). Стоят ли пакеты провайдера памяти в venv ядра.
//
// ПОЧЕМУ НЕ ВЕРИТЬ ЯДРУ. С 0.22 их `GET /api/memory` считает зависимости
// провайдера установленными, только если их поставил их менеджер пакетов
// (`web_server_memory.py::_memory_provider_setup_info` → `pm.venv_is_current`).
// Зависимости Mem0 ставит наш `runtime/setup.mjs` в venv ядра по пину, мимо pm
// (развилка T20.12), — и ядро отвечает `unavailable` / `dependencies_installed:
// false` при работающей памяти. Замер на копии профиля автотестов: импорт `mem0`
// и `qdrant_client` проходит, `available: true`, `configured: true`, статус —
// `unavailable`. Правду о пакете здесь знаем только мы.

/** Дистрибутивы, без которых провайдер Mem0 не поднимается (`mem0-plugin-requirements.txt`). */
export const MEM0_DISTRIBUTIONS = ['mem0ai', 'qdrant-client'] as const

/** Имя каталога `*.dist-info` по PEP 427: регистр и `-`/`.` приводятся к `_`. */
function normalized(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '_')
}

/** Все ли `names` есть среди записей `site-packages`. */
export function distributionsInstalled(
  entries: readonly string[],
  names: readonly string[]
): boolean {
  const present = new Set(
    entries
      .filter((entry) => entry.toLowerCase().endsWith('.dist-info'))
      .map((entry) => normalized(entry.slice(0, -'.dist-info'.length).replace(/-[^-]*$/, '')))
  )
  return names.every((name) => present.has(normalized(name)))
}
