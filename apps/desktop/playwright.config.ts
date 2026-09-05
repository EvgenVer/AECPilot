import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 120000,
  // Снимок в момент отказа. Задача 3D.3: раскладка левой колонки изменилась
  // (роестр стал вкладкой рядом с sessions), и разбирать перехват нажатия по
  // текстовому дереву значит гадать — на картинке видно, что чем накрыто.
  use: { screenshot: 'only-on-failure' }
})
