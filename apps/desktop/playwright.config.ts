import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 120000,
  // Снимок в момент отказа. Задача 3D.3: раскладка левой колонки изменилась
  // (роестр стал вкладкой рядом с sessions), и разбирать перехват нажатия по
  // текстовому дереву значит гадать — на картинке видно, что чем накрыто.
  use: { screenshot: 'only-on-failure' },
  // JSON рядом со свидетельствами — отчёт приёмки (3F.11) берёт из него время прогона.
  reporter: [['list'], ['json', { outputFile: 'test-results/acceptance/results.json' }]],
  // Три проекта (задача 3F.1). `smoke` — как было; `acceptance` — позиции
  // чек-листа на mock-шлюзе, идёт в гейте вместе со smoke; `acceptance-live` —
  // позиции на живом ядре (временный профиль), ходы модели — только при
  // `AEC_ACCEPTANCE_LIVE=1`. Живому ядру нужен холодный старт ≈30 с на файл
  // спеки и медленные ходы, отсюда свой потолок времени.
  projects: [
    { name: 'smoke', testMatch: /donor-shell-smoke\.spec\.ts$/ },
    { name: 'acceptance', testMatch: /acceptance[\\/]blocks-.*\.spec\.ts$/ },
    {
      name: 'acceptance-live',
      testMatch: /acceptance[\\/](live|model)-.*\.spec\.ts$/,
      timeout: 300000
    },
    // Протокол рабочего стола (задача 3F.12): настоящие окна ОС — проводник,
    // диалог сохранения — на экране человека, поэтому вне гейта `pnpm e2e`.
    { name: 'desktop', testMatch: /acceptance[\\/]desktop-.*\.spec\.ts$/ },
    // Приёмка AC1 (задача T24): установленный exe на имитации чистой машины
    // (`AEC_E2E_EXECUTABLE`, `AEC_E2E_CLEAN_HOME`); индексация двух источников с нуля
    // долгая, поэтому вне гейта и со своим потолком.
    // Проход языков (задача T27): снимки и выписка подозрительных строк — для разбора.
    { name: 'locale', testMatch: /acceptance[\\/]locale-sweep\.spec\.ts$/ },
    {
      name: 'clean-machine',
      testMatch: /acceptance[\\/]ac\d+-.*\.spec\.ts$/,
      timeout: 1200000
    }
  ]
})
