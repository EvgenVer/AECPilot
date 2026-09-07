// The РАСХОЖДЕНИЕ section of the tools axis is the product of this script, so
// every test here guards one way that section could go empty while being wrong:
// a platform bundle counted as a capability, a family prefix swallowing a tool
// nobody decided about, a citation pointing at a document that no longer says
// it, a verdict outliving the tool it answered for.

import { describe, expect, it } from "vitest";

import {
  buildRegistry,
  formatRegistry,
  ownersOf,
  splitToolsets,
  verdictFor,
} from "./tool-registry.mjs";

const base = { exclusions: ["HX11"], taskIds: new Set(["3E.3"]) };

describe("splitToolsets", () => {
  it("платформенные наборы не считаются возможностями", () => {
    const split = splitToolsets({
      web: { tools: ["web_search"], includes: [] },
      "hermes-telegram": { tools: ["web_search"], includes: [] },
    });

    expect(Object.keys(split.capability)).toEqual(["web"]);
    expect(split.tools).toEqual(["web_search"]);
    expect(split.onlyInPlatforms, "связка не принесла своего").toEqual([]);
  });

  it("но если связка принесла СВОЁ — это видно, а не проглатывается", () => {
    // Правило «связки — это те же инструменты» верно на 0.21.0 и замерено, а не
    // предположено. Перестанет быть верным — реестр обязан сказать об этом.
    const split = splitToolsets({
      web: { tools: ["web_search"], includes: [] },
      "hermes-telegram": { tools: ["web_search", "tg_only"], includes: [] },
    });

    expect(split.onlyInPlatforms).toEqual(["tg_only"]);
  });
});

describe("verdictFor", () => {
  it("точное имя сильнее семьи", () => {
    const verdicts = {
      browser_cdp: { status: "excluded", hx: "HX11" },
      "browser_*": { status: "task", task: "3E.3" },
    };

    expect(verdictFor("browser_cdp", verdicts).status).toBe("excluded");
    expect(verdictFor("browser_click", verdicts).status).toBe("task");
  });

  it("чужое имя семья не забирает", () => {
    expect(verdictFor("web_search", { "browser_*": { status: "task", task: "3E.3" } })).toBeNull();
  });
});

describe("buildRegistry", () => {
  const toolsets = { web: { tools: ["web_search", "web_extract"], includes: [] } };

  it("инструмент без вердикта уходит в расхождение вместе с его набором", () => {
    const registry = buildRegistry({
      ...base,
      toolsets,
      verdicts: { web_search: { status: "task", task: "3E.3", where: "UR32" } },
    });

    expect(registry.divergent).toEqual([{ tool: "web_extract", owners: ["web"] }]);
  });

  it("исключение с отменённым номером — ссылка в никуда, а не исключение", () => {
    const registry = buildRegistry({
      ...base,
      exclusions: ["HX1"],
      toolsets: { tts: { tools: ["text_to_speech"], includes: [] } },
      verdicts: { text_to_speech: { status: "excluded", hx: "HX19", where: "голос" } },
    });

    expect(registry.badCitations).toHaveLength(1);
    expect(registry.badCitations[0]).toContain("HX19");
  });

  it("задача, которой нет в TASKS, тоже ссылка в никуда", () => {
    const registry = buildRegistry({
      ...base,
      toolsets,
      verdicts: {
        "web_*": { status: "task", task: "9.99", where: "выдуманная задача" },
      },
    });

    expect(registry.badCitations).toHaveLength(2);
  });

  it("вердикт пережил ЗАДАЧУ — тоже находка: работа сделана, а таблица зовёт её будущей", () => {
    // Это не педантизм. Реестр — единственное место, где написано, что у
    // продукта есть, а чего нет; строка «задача 3E.2» после закрытия 3E.2
    // означает «веб-поиска у нас пока нет», то есть ровно неправду о том, ради
    // чего реестр заведён. Так и протухла первая строка — её и нашла эта
    // проверка.
    const registry = buildRegistry({
      ...base,
      closedTaskIds: new Set(["3E.3"]),
      toolsets,
      verdicts: { "web_*": { status: "task", task: "3E.3", where: "UR32" } },
    });

    expect(registry.badCitations).toHaveLength(2);
    expect(registry.badCitations[0]).toContain("ЗАКРЫТА");
  });

  it("вердикт пережил инструмент — это находка, а не порядок", () => {
    const registry = buildRegistry({
      ...base,
      toolsets,
      verdicts: {
        "web_*": { status: "task", task: "3E.3", where: "UR32" },
        vibe_check: { status: "ours", where: "инструмента давно нет" },
      },
    });

    expect(registry.stale).toEqual(["vibe_check"]);
  });
});

describe("formatRegistry", () => {
  it("пустое расхождение говорит об этом прямо, непустое — печатает правило фазы", () => {
    const clean = buildRegistry({
      ...base,
      toolsets: { web: { tools: ["web_search"], includes: [] } },
      verdicts: { web_search: { status: "task", task: "3E.3", where: "UR32" } },
    });
    const dirty = buildRegistry({ ...base, toolsets: { web: { tools: ["web_search"] } }, verdicts: {} });

    expect(formatRegistry(clean)).toContain("РАСХОЖДЕНИЕ (0)");
    expect(formatRegistry(dirty)).toContain("выносится ВЛАДЕЛЬЦУ");
  });
});
