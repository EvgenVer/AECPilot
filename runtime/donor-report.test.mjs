// The report drives a re-port that costs hours, so each test below pins one
// way the count could be wrong in a direction nobody would notice: a phantom
// file in the plan, an edited file buried at the bottom of it, a renamed source
// reported as an ordinary change.

import { describe, expect, it } from "vitest";

import {
  buildReport,
  formatReport,
  parseHeader,
  parseNameStatus,
  parseNumstat,
  surfaceOf,
} from "./donor-report.mjs";

const SHA = "3c27eb6234bf91b8ceee9e9071591b31e9b148cb";

function header({ source, edits = " none" }) {
  return [
    "/**",
    " * Vendored from Hermes Desktop — do not refactor. See donor/README.md.",
    ` * Source:  ${source}`,
    ` * Commit:  ${SHA} (v2026.8.3)`,
    " * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)",
    ` * Edits:${edits}`,
    " */",
    "",
  ].join("\n");
}

describe("parseHeader", () => {
  it("reads the source path and the pinned commit", () => {
    const parsed = parseHeader(header({ source: "apps/desktop/src/lib/text.ts" }));
    expect(parsed).toEqual({ source: "apps/desktop/src/lib/text.ts", commit: SHA, edited: false });
  });

  it("counts a file as edited from the Edits line, not from an inline marker", () => {
    // An edit of the "dropped an import we do not have" kind leaves no `EDIT [n]`
    // in the body — only a header entry. Counting markers found 18 of the 22
    // files the zone actually carries.
    const withEntry = header({ source: "a.ts", edits: "\n *   [4] dropped their telemetry import" });
    expect(parseHeader(withEntry).edited).toBe(true);
    expect(parseHeader(header({ source: "a.ts" })).edited).toBe(false);
  });

  it("ignores a header quoted inside a document", () => {
    // donor/README.md documents the format by showing a filled-in example. Taken
    // at face value it becomes a vendored file we never ported, and its source
    // path lands in the re-port plan.
    const readme = ["# Вендорная зона", "", "Каждый файл начинается заголовком:", "", header({ source: "apps/desktop/src/app/chat/message-list.tsx" })].join("\n");
    expect(parseHeader(readme)).toBeNull();
  });

  it("accepts CRLF, because the zone is edited on Windows", () => {
    const crlf = header({ source: "a.ts" }).replace(/\n/g, "\r\n");
    expect(parseHeader(crlf)?.source).toBe("a.ts");
  });
});

describe("git output parsing", () => {
  it("keeps binary files in the change set with zero counts", () => {
    const numstat = parseNumstat(["12\t3\tsrc/a.ts", "-\t-\tsrc/logo.webp"].join("\n"));
    expect(numstat.get("src/a.ts")).toEqual({ added: 12, deleted: 3, binary: false });
    expect(numstat.get("src/logo.webp")).toEqual({ added: 0, deleted: 0, binary: true });
  });

  it("reads add/modify/delete statuses", () => {
    const status = parseNameStatus(["A\tsrc/new.ts", "M\tsrc/old.ts", "D\tsrc/gone.ts"].join("\n"));
    expect([...status]).toEqual([
      ["src/new.ts", "A"],
      ["src/old.ts", "M"],
      ["src/gone.ts", "D"],
    ]);
  });
});

describe("surfaceOf", () => {
  it("groups at the granularity a TASKS entry names", () => {
    expect(surfaceOf("apps/desktop/src/app/chat/sidebar/index.tsx")).toBe("app/chat");
    expect(surfaceOf("apps/desktop/src/store/wake-word.ts")).toBe("store/wake-word.ts");
    expect(surfaceOf("apps/desktop/electron/quick-entry.ts")).toBe("electron");
    expect(surfaceOf("apps/shared/src/types.ts")).toBe("shared");
  });
});

describe("buildReport", () => {
  const vendored = [
    { vendored: "hermes.ts", source: "apps/desktop/src/hermes.ts", edited: true },
    { vendored: "lib/text.ts", source: "apps/desktop/src/lib/text.ts", edited: false },
    { vendored: "app/skills/hub.tsx", source: "apps/desktop/src/app/skills/hub.tsx", edited: false },
    { vendored: "lib/frozen.ts", source: "apps/desktop/src/lib/frozen.ts", edited: false },
  ];
  const status = parseNameStatus(
    [
      "M\tapps/desktop/src/hermes.ts",
      "M\tapps/desktop/src/lib/text.ts",
      "D\tapps/desktop/src/app/skills/hub.tsx",
      "A\tapps/desktop/src/app/hud/hud-shell.tsx",
    ].join("\n"),
  );
  const numstat = parseNumstat(
    [
      "10\t2\tapps/desktop/src/hermes.ts",
      "400\t100\tapps/desktop/src/lib/text.ts",
      "0\t80\tapps/desktop/src/app/skills/hub.tsx",
      "300\t0\tapps/desktop/src/app/hud/hud-shell.tsx",
    ].join("\n"),
  );
  const report = buildReport({
    vendored,
    status,
    numstat,
    from: { ref: "old", sha: SHA },
    to: { ref: "new", sha: "f".repeat(40) },
  });

  it("leaves a file the donor did not touch out of the plan", () => {
    // The whole basis of Phase 3A: zero churn means the port is free, so such a
    // file must not appear as work.
    expect(report.changed.map((r) => r.source)).not.toContain("apps/desktop/src/lib/frozen.ts");
  });

  it("puts edited files first even when their churn is smaller", () => {
    // A re-copy is mechanical; re-applying an edit is not. Sorting by size alone
    // buries the only rows that need a human.
    expect(report.changed[0].source).toBe("apps/desktop/src/hermes.ts");
    expect(report.changed[0].churn).toBeLessThan(report.changed[1].churn);
  });

  it("separates a vanished source from an ordinary change", () => {
    // Real case: `app/skills/hub.tsx` — the file TASKS 3.8 pointed at — is gone
    // at v0.20.2. "Re-copy it" is not an instruction that can be followed.
    expect(report.changed.map((r) => r.source)).not.toContain("apps/desktop/src/app/skills/hub.tsx");
    expect(report.vanished).toHaveLength(1);
    expect(report.vanished[0].source).toBe("apps/desktop/src/app/skills/hub.tsx");
  });

  it("counts churn over the whole donor tree, not only what we ported", () => {
    // Classifying an un-ported surface into 3A or 3B is the other half of the
    // job; a churn table limited to our zone cannot answer it.
    const hud = report.surfaces.find((s) => s.surface === "app/hud");
    expect(hud).toEqual({ surface: "app/hud", changed: 1, added: 1, deleted: 0, plus: 300, minus: 0 });
  });

  it("reports the edited total against the whole zone, not the changed slice", () => {
    expect(report.vendoredTotal).toBe(4);
    expect(report.editedTotal).toBe(1);
  });
});

describe("formatReport", () => {
  it("says plainly when nothing has to be re-ported", () => {
    const text = formatReport(
      buildReport({
        vendored: [{ vendored: "a.ts", source: "apps/desktop/src/a.ts", edited: false }],
        status: new Map(),
        numstat: new Map(),
        from: { ref: "old", sha: SHA },
        to: { ref: "new", sha: SHA },
      }),
    );
    expect(text).toContain("ничего — зона совпадает с этой версией");
  });
});
