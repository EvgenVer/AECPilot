// The РАСХОЖДЕНИЕ section of the platform axis is meant to be empty, so every
// test here guards one way it could go empty while being wrong: a card promised
// that our bridge never publishes, a reason citing a number the documents no
// longer carry, a verdict outliving the entrance it answers for, and a bundle
// cross-check that guesses instead of reading their table.

import { describe, expect, it } from "vitest";

import {
  buildRegistry,
  formatRegistry,
  readClosedFindingIds,
  readFindingIds,
  readShortlist,
} from "./platform-registry.mjs";

/** A miniature core: two entrances, one bundle, one static row. */
const platforms = {
  catalog: ["telegram", "slack"],
  static: ["telegram", "cli"],
  defaultToolsets: { telegram: "hermes-telegram", cli: "hermes-cli" },
  bundles: ["hermes-telegram", "hermes-cli"],
};

const base = {
  platforms,
  shortlist: ["telegram"],
  exclusions: ["HX11"],
  taskIds: new Set(["3.11"]),
  findingIds: new Set(["D-81"]),
};

const shown = { status: "shown", where: "короткий список O7" };
const ours = { status: "ours", where: "UR19" };

describe("readShortlist", () => {
  it("reads the list from the module that enforces it", () => {
    const source = [
      "/** Их экран запрашивает список платформ этим GET. */",
      "export const CHANNEL_SHORTLIST = ['telegram', 'email', 'webhook', 'a2a'] as const",
      "const other = ['discord']",
    ].join("\n");

    expect(readShortlist(source)).toEqual(["telegram", "email", "webhook", "a2a"]);
  });

  it("returns nothing when the list is gone, rather than a stale copy", () => {
    // Silence here beats invention: an empty answer turns every `shown` verdict
    // into a ССЫЛКА В НИКУДА, which is exactly what a deleted shortlist means.
    expect(readShortlist("export const NOTHING = 1")).toEqual([]);
  });
});

describe("finding ids", () => {
  // С 2026-10-15 вопрос владельцу — обычная строка таблицы TASKS; прежний номер
  // `D-81` встречается только в карте переименований и ссылкой не считается.
  const tasks = [
    "| T20 | Транспорт через их коннектор | blocked | none | Check: x; Result: pending |",
    "| T21 | Мок | done | none | Check: y; Result: passed — прогон |",
    "| D-81 | T20 |",
    "проза про D-99"
  ].join("\n");

  it("reads the task rows a verdict put to the owner can cite", () => {
    expect([...readFindingIds(tasks)].sort()).toEqual(["T20", "T21"]);
  });

  it("separates the ones already answered", () => {
    expect([...readClosedFindingIds(tasks)]).toEqual(["T21"]);
  });
});

describe("buildRegistry integrity", () => {
  it("leaves an entrance nobody decided about in the разрыв", () => {
    const registry = buildRegistry({ ...base, verdicts: { telegram: shown } });
    expect(registry.divergent.map((row) => row.id)).toEqual(["slack"]);
  });

  it("reports a reason that cites an exclusion SPEC no longer has", () => {
    const registry = buildRegistry({
      ...base,
      exclusions: [],
      verdicts: { telegram: shown, slack: { status: "excluded", hx: "HX11", where: "Slack" } },
    });
    expect(registry.badCitations.join()).toContain("HX11");
  });

  it("calls a verdict citing a CLOSED task stale as one citing a task TASKS lost", () => {
    const registry = buildRegistry({
      ...base,
      closedTaskIds: new Set(["3.11"]),
      verdicts: { telegram: shown, slack: { status: "task", task: "3.11", where: "A2A" } },
    });
    expect(registry.badCitations.join()).toContain("ЗАКРЫТА");
  });

  it("reports a row waiting on the owner whose finding TASKS never had", () => {
    const registry = buildRegistry({
      ...base,
      findingIds: new Set(),
      verdicts: { telegram: shown, slack: { status: "owner", finding: "D-81", where: "транспорт" } },
    });
    expect(registry.badCitations.join()).toContain("D-81");
  });

  it("reports a row still waiting on an owner who has already answered", () => {
    // The dangerous direction of «у владельца»: the decision arrived, the table
    // keeps asking. Without this the section would quietly become a parking lot.
    const registry = buildRegistry({
      ...base,
      closedFindingIds: new Set(["D-81"]),
      verdicts: { telegram: shown, slack: { status: "owner", finding: "D-81", where: "транспорт" } },
    });
    expect(registry.badCitations.join()).toContain("ЗАКРЫТО");
  });

  it("turns a promised card our bridge does not publish into a ССЫЛКА В НИКУДА", () => {
    // A verdict may not promise a person a switch they will never see.
    const registry = buildRegistry({ ...base, verdicts: { telegram: shown, slack: shown } });
    expect(registry.badCitations.join()).toContain("короткий список моста её не публикует");
  });

  it("turns a published card the table denies into a ССЫЛКА В НИКУДА too", () => {
    const registry = buildRegistry({
      ...base,
      shortlist: ["telegram", "slack"],
      verdicts: { telegram: shown, slack: ours },
    });
    expect(registry.badCitations.join()).toContain("мост публикует карточку");
  });

  it("reports a shortlist entry the core does not ship", () => {
    const registry = buildRegistry({
      ...base,
      shortlist: ["telegram", "webhook"],
      verdicts: { telegram: shown, slack: ours },
    });
    expect(registry.badCitations.join()).toContain("а у ядра такого входа нет");
  });

  it("reports a verdict for an entrance the core dropped", () => {
    const registry = buildRegistry({
      ...base,
      verdicts: { telegram: shown, slack: ours, icq: ours },
    });
    expect(registry.stale).toEqual(["icq"]);
  });
});

describe("cross-checks that must not guess", () => {
  it("takes the bundle of an entrance from their table, not from its name", () => {
    // Real case: `whatsapp_cloud` shares `hermes-whatsapp`, and a name
    // transformation (`hermes-whatsapp-cloud`) reported it as an entrance
    // without a bundle — an invented gap in a report whose whole point is to
    // separate real ones from noise.
    const registry = buildRegistry({
      ...base,
      platforms: {
        catalog: ["telegram", "whatsapp_cloud"],
        static: ["telegram", "whatsapp_cloud"],
        defaultToolsets: { telegram: "hermes-telegram", whatsapp_cloud: "hermes-whatsapp" },
        bundles: ["hermes-telegram", "hermes-whatsapp"],
      },
      verdicts: { telegram: shown, whatsapp_cloud: ours },
    });

    expect(registry.untabled).toEqual([]);
    expect(registry.withoutPlatform).toEqual([]);
  });

  it("keeps an entrance their static table never lists out of the разрыв", () => {
    // Plugin platforms are absent from that table by construction. Counting the
    // absence as a hole would repeat the «helper folder as a screen» error the
    // screens axis already corrects.
    const registry = buildRegistry({ ...base, verdicts: { telegram: shown, slack: ours } });
    expect(registry.divergent).toEqual([]);
    expect(registry.untabled).toEqual(["slack"]);
  });

  it("does not call a static-only entrance a card", () => {
    const registry = buildRegistry({ ...base, verdicts: { telegram: shown, slack: ours } });
    expect(registry.notCards).toEqual(["cli"]);
  });
});

describe("formatRegistry", () => {
  it("states plainly when every entrance has an answer", () => {
    const registry = buildRegistry({ ...base, verdicts: { telegram: shown, slack: ours } });
    expect(formatRegistry(registry)).toContain("РАСХОЖДЕНИЕ (0)");
    expect(formatRegistry(registry)).toContain("включённый канал не прячется никогда");
  });
});
