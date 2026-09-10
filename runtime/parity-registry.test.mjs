// AC9 is met when the разрыв section is empty, so every test here guards one
// way that section could go empty while being wrong: a helper folder counted as
// a screen, a reason citing a document that no longer says it, a reason left
// behind after the surface was ported.

import { describe, expect, it } from "vitest";

import {
  buildRegistry,
  classifyChannel,
  classifySurface,
  formatRegistry,
  readChannelGroups,
  readDenied,
  readExclusions,
  readTaskIds,
} from "./parity-registry.mjs";

const from = { ref: "v0.20.2", sha: "d".repeat(40) };
const base = { exclusions: ["HX1"], taskIds: new Set(["3.5"]), denied: ["model.save_key"], from };

describe("classifySurface", () => {
  it("does not call a surface ours because a helper of it was pulled in", () => {
    // Real case: our zone carries app/cron/job-state.ts and no screen — one file
    // dragged in as somebody else's dependency. Counting files reported the cron
    // surface as present at 1/9 and let a real разрыв pass as coverage.
    const row = classifySurface("cron", { theirs: 9, ours: 1, entry: false, rule: { task: "3.5" } });
    expect(row.status).toBe("planned");
  });

  it("counts a surface as ours when its entry point is vendored", () => {
    expect(classifySurface("chat", { theirs: 122, ours: 107, entry: true }).status).toBe("ours");
  });

  it("leaves an unexplained missing surface in the разрыв", () => {
    expect(classifySurface("newthing", { theirs: 4, ours: 0, entry: false }).status).toBe("gap");
  });

  it("counts a surface as ours when it arrived by another road and the file exists", () => {
    // Быстрый ввод живёт в собственном preload, поэтому в группах каналов его
    // нет вовсе — и без этого вида записи честных вариантов было два: соврать
    // «запланировано» или объявить разрыв о сделанном.
    const rule = { ourWay: "apps/desktop/src/preload/quick-entry.ts" };
    const row = classifySurface("quick-entry", {
      theirs: 5,
      ours: 0,
      entry: false,
      rule,
      ourFiles: new Set([rule.ourWay]),
    });
    expect(row.status).toBe("ours");
  });

  it("prefers a port over any recorded reason for not having one", () => {
    const row = classifySurface("hud", { theirs: 11, ours: 11, entry: true, rule: { task: "3.24" } });
    expect(row.status).toBe("ours");
  });
});

describe("document parsing", () => {
  it("reads exclusion ids from the SPEC list", () => {
    const spec = ["- **HX1. Питомец** (`pet.*`).", "- **HX2. Оплата**.", "текст про HX9 в прозе"].join("\n");
    expect(readExclusions(spec)).toEqual(["HX1", "HX2"]);
  });

  it("reads task ids including split and phase-prefixed ones", () => {
    const tasks = [
      "- [ ] 3.7a Голос — files: x",
      "- [x] 3.0 Замер — files: y",
      "- [ ] 3.B0 Подъём — files: z",
      // Кириллица в номере: так подписана половина списка (`5.1а`, `3.B3д`), а
      // до задачи 3E.17 парсер такие задачи не видел вовсе.
      "- [ ] 5.1а Ключи провайдера — files: w"
    ].join("\n");
    expect([...readTaskIds(tasks)].sort()).toEqual(["3.0", "3.7a", "3.B0", "5.1а"]);
  });

  it("reads the deny list from the module rather than a copy of it", () => {
    const deny = "export const DENIED_RPC_METHODS: readonly string[] = ['model.save_key', 'env.reveal']";
    expect(readDenied(deny)).toEqual(["model.save_key", "env.reveal"]);
  });
});

describe("readChannelGroups", () => {
  const preload = [
    "  getVersion: () => ipcRenderer.invoke('hermes:version'),",
    "  readFileText: p => ipcRenderer.invoke('hermes:readFileText', p),",
    "  onDeepLink: cb => ipcRenderer.on('hermes:deep-link', cb),",
    "  setZoom: z => ipcRenderer.send('hermes:zoom', z),",
    "  notOurs: () => ipcRenderer.invoke('other:thing'),",
  ].join("\n");

  it("keeps camelCase channels", () => {
    // A first pass at this used a lowercase-only character class and reported 52
    // groups where there are 74 — twenty capabilities (readFileText, selectPaths,
    // openExternal …) silently absent from the inventory that exists to find
    // absences.
    expect(readChannelGroups(preload, "hermes:")).toContain("readFileText");
  });

  it("strips their namespace and ignores channels outside it", () => {
    const groups = readChannelGroups(preload, "hermes:");
    expect(groups).toEqual(["deep-link", "readFileText", "version", "zoom"]);
  });

  it("reads our unprefixed surface the same way", () => {
    expect(readChannelGroups("ipcRenderer.invoke('viewer:read-document')")).toEqual(["viewer"]);
  });
});

describe("classifyChannel", () => {
  it("counts theirs as covered only when our channel really exists", () => {
    const ourGroups = new Set(["shell"]);
    expect(classifyChannel("openExternal", { rule: { ours: "shell" }, ourGroups }).status).toBe("ours");
  });

  it("turns a claim our preload no longer honours into a разрыв, not coverage", () => {
    // Our preload is ours to rename; a table promising a channel that is gone
    // must not keep reading as parity.
    const row = classifyChannel("openExternal", { rule: { ours: "shell" }, ourGroups: new Set() });
    expect(row.status).toBe("gap");
    expect(row.brokenClaim).toBe("shell");
  });

  it("leaves an unmapped capability in the разрыв", () => {
    expect(classifyChannel("translucency", { rule: undefined, ourGroups: new Set() }).status).toBe("gap");
  });

  it("counts «наше, но другой дорогой» only when the cited file is really there", () => {
    // Поиск по странице сделан в рендерере, а не через `webContents.findInPage`:
    // их канала у нас нет и не будет, а возможность есть. Ссылка на файл — то,
    // чем такая запись отличается от обещания.
    const rule = { ourWay: "apps/desktop/src/renderer/src/donor/store/find-in-page.ts" };
    const ours = classifyChannel("find-in-page", { rule, ourGroups: new Set(), ourFiles: new Set([rule.ourWay]) });
    expect(ours.status).toBe("ours");
    expect(ours.via).toBe(rule.ourWay);
  });

  it("turns «наше, но другой дорогой» without that file into a разрыв, not coverage", () => {
    const rule = { ourWay: "apps/desktop/src/renderer/src/donor/store/find-in-page.ts" };
    const row = classifyChannel("find-in-page", { rule, ourGroups: new Set(), ourFiles: new Set() });
    expect(row.status).toBe("gap");
    expect(row.brokenClaim).toBe(rule.ourWay);
  });

  it("keeps a measured «what is missing» on a разрыв row", () => {
    // Строка без вердикта, но с пояснением — разрыв, который уже смотрели
    // глазами. Владельцу это решать иначе, чем строку, куда никто не заглядывал.
    const row = classifyChannel("watchPreviewFile", { rule: { note: "слежение за файлом" }, ourGroups: new Set() });
    expect(row.status).toBe("gap");
    expect(row.note).toBe("слежение за файлом");
  });
});

describe("buildRegistry integrity", () => {
  it("reports a reason that cites an exclusion SPEC no longer has", () => {
    const registry = buildRegistry({
      ...base,
      exclusions: [],
      surfaces: { "pet-overlay": { theirs: 2, ours: 0, entry: false } },
    });
    expect(registry.problems.join()).toContain("HX1");
  });

  it("reports a reason that cites a task TASKS no longer has", () => {
    const registry = buildRegistry({
      ...base,
      taskIds: new Set(),
      // Фикстура обязана называть строку, которая ЕЩЁ ССЫЛАЕТСЯ НА ЗАДАЧУ:
      // проверяется механизм, но берётся живая таблица, и перенос поверхности
      // роняет такой тест. Так случилось дважды — с `cron` при закрытии D-50 и
      // с `webhooks` при переносе экрана 2026-09-10 (задача 3.11). Поэтому
      // подопытное взято из ELECTRON_CLASSIFICATION (`updates` → 3.21): в
      // поверхностях строк с задачей больше НЕ ОСТАЛОСЬ, а эта ждёт упаковки
      // фазы 6 и переживёт всё, что до неё.
      surfaces: {},
      channels: { theirs: ["updates"], ours: [] },
    });
    expect(registry.problems.join()).toContain("3.21");
  });

  it("calls a verdict citing a CLOSED task as stale as one citing a task TASKS lost", () => {
    // Замечание D-71: 46 строк отвечали «работа впереди» про работу, которая
    // позади. `readClosedTaskIds` был написан с этой самой формулировкой и не
    // подключён — тест держит именно подключение, а не разбор.
    const registry = buildRegistry({
      ...base,
      taskIds: new Set(["3.21"]),
      closedTaskIds: new Set(["3.21"]),
      surfaces: {},
      channels: { theirs: ["updates"], ours: [] },
    });
    expect(registry.problems.join()).toContain("ЗАКРЫТУЮ задачу 3.21");
  });

  it("reports a «наше, но другой дорогой» whose file the repository no longer has", () => {
    const registry = buildRegistry({
      ...base,
      ourFiles: [],
      surfaces: { "quick-entry": { theirs: 5, ours: 0, entry: false } },
    });
    expect(registry.problems.join()).toContain("quick-entry.ts");
  });

  it("reports a reason left behind after the surface was ported", () => {
    // The dangerous direction: the table keeps explaining why we do not have a
    // screen we now do have, and the explanation reads as current.
    // Подопытное — `pet-overlay`: она исключена HX1 навсегда, то есть в таблице
    // останется при любом переносе, и механизм на ней не осиротеет.
    const registry = buildRegistry({
      ...base,
      surfaces: { "pet-overlay": { theirs: 2, ours: 2, entry: true } },
    });
    expect(registry.problems.join()).toContain("перенесена");
  });

  it("reports a table entry for a surface the donor no longer has", () => {
    const registry = buildRegistry({ ...base, surfaces: { chat: { theirs: 1, ours: 1, entry: true } } });
    expect(registry.problems.join()).toContain("которой нет у донора");
  });
});

describe("reachability note", () => {
  it("says an excluded family stays reachable through the generic channel", () => {
    // §Non-Goals is a product decision; the deny list is a security one. A reader
    // who takes the first for the second is wrong about what protects them.
    const registry = buildRegistry({ ...base, surfaces: { chat: { theirs: 1, ours: 1, entry: true } } });
    expect(registry.reachableExcluded.map((e) => e.hx)).toContain("HX1");
    expect(formatRegistry(registry)).toContain("НЕ разрыв паритета");
  });
});

describe("formatRegistry", () => {
  it("states plainly when AC9 is met", () => {
    const registry = buildRegistry({ ...base, surfaces: { chat: { theirs: 1, ours: 1, entry: true } } });
    expect(formatRegistry(registry)).toContain("AC9 выполнен");
  });
});
