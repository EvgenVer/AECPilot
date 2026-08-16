// AC9 is met when the разрыв section is empty, so every test here guards one
// way that section could go empty while being wrong: a helper folder counted as
// a screen, a reason citing a document that no longer says it, a reason left
// behind after the surface was ported.

import { describe, expect, it } from "vitest";

import {
  buildRegistry,
  classifySurface,
  formatRegistry,
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
    const tasks = ["- [ ] 3.7a Голос — files: x", "- [x] 3.0 Замер — files: y", "- [ ] 3.B0 Подъём — files: z"].join("\n");
    expect([...readTaskIds(tasks)].sort()).toEqual(["3.0", "3.7a", "3.B0"]);
  });

  it("reads the deny list from the module rather than a copy of it", () => {
    const deny = "export const DENIED_RPC_METHODS: readonly string[] = ['model.save_key', 'env.reveal']";
    expect(readDenied(deny)).toEqual(["model.save_key", "env.reveal"]);
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
      surfaces: { cron: { theirs: 9, ours: 1, entry: false } },
    });
    expect(registry.problems.join()).toContain("3.5");
  });

  it("reports a reason left behind after the surface was ported", () => {
    // The dangerous direction: the table keeps explaining why we do not have a
    // screen we now do have, and the explanation reads as current.
    const registry = buildRegistry({ ...base, surfaces: { cron: { theirs: 9, ours: 9, entry: true } } });
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
