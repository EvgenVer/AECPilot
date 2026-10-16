// Задача T20.10 (пин 0.22.2). Барьер их SDK вырос ещё раз: холодный импорт
// `@hermes/plugin-sdk` в проекте `donor-heavy` — около 113 с на этой машине, а
// потолок их `beforeAll` — 60 с, прописан в их файле. Платил тот файл группы,
// который шёл первым (то `bot-delete`, то `hidden-bots`); второй брал уже
// готовые трансформации и проходил.
//
// Здесь цена берётся до тестов и без исполнения модулей: `globalSetup` проекта
// проходит граф SDK на сервере Vite и трансформирует каждый файл в окружении,
// из которого jsdom-тесты их потом берут (`client`). Импорт в setup-файле не
// годится — модуль исполнился бы раньше их `vi.mock` и разошёлся бы с ним.
import type { TestProject } from 'vitest/node'

export default async function warmDonorSdk(project: TestProject): Promise<void> {
  const environment = project.vite.environments.client
  const entry = await environment.pluginContainer.resolveId('@hermes/plugin-sdk')
  if (!entry) return

  const seen = new Set<string>()
  const walk = async (url: string): Promise<void> => {
    if (seen.has(url)) return
    seen.add(url)
    try {
      await environment.transformRequest(url)
    } catch {
      return // не наша забота здесь: тот же импорт в тесте скажет, что сломано
    }
    const node = await environment.moduleGraph.getModuleByUrl(url)
    const next = [...(node?.importedModules ?? [])].map((dep) => dep.url)
    await Promise.all(next.filter((dep) => !dep.includes('node_modules')).map(walk))
  }
  await walk(entry.id)
}
