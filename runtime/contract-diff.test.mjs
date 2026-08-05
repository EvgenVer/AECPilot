// The comparator's job is to make three kinds of change impossible to miss.
// Each test below is one of those kinds, on a hand-written pair of snapshots —
// small enough to read, so a failure names the category that stopped working.

import { describe, expect, it } from "vitest";
import { diffSnapshots, formatReport } from "./contract-diff.mjs";

/** A format-2 snapshot with every section present, so a test can change one
 * thing and know that is the only thing the diff can be reacting to. */
function snapshot(overrides = {}) {
  return {
    snapshotFormat: 2,
    hermesVersion: "0.0.0",
    hermesSha: "0".repeat(40),
    gatewayMethods: {
      "model.options": {
        file: "methods_complete.py",
        lines: 20,
        hash: "aaaa",
        defaults: { include_unconfigured: "True" },
      },
      "session.list": { file: "methods_session.py", lines: 10, hash: "bbbb", defaults: {} },
    },
    coreRestRoutes: { "GET /api/profiles": "web_routers/profiles.py" },
    configDefaults: { "agent.max_turns": 90, "agent.gateway_timeout": 1800 },
    requiresDist: ['mcp==1.26.0', 'starlette==1.0.1 ; extra == "mcp"'],
    gatewayEmittedEvents: ["status.update", "skin.changed"],
    checkpointMarkers: [".git"],
    ourMethods: {
      "model.options": {
        file: "methods_complete.py",
        lines: 20,
        hash: "aaaa",
        defaults: { include_unconfigured: "True" },
      },
    },
    ourRestRoutes: { "/api/profiles": true },
    ...overrides,
  };
}

/** Deep-ish clone with one gateway method replaced. */
function withMethod(base, name, patch) {
  const methods = { ...base.gatewayMethods, [name]: { ...base.gatewayMethods[name], ...patch } };
  return { ...base, gatewayMethods: methods };
}

describe("diffSnapshots", () => {
  it("сообщает «ничего», когда слепки совпадают", () => {
    const diff = diffSnapshots(snapshot(), snapshot());
    expect(diff.broken).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.silent).toEqual([]);
  });

  describe("сломалось", () => {
    it("ловит исчезнувший метод и помечает те, которые вызываем мы", () => {
      const before = snapshot();
      const after = snapshot();
      delete after.gatewayMethods["model.options"];

      const diff = diffSnapshots(before, after);
      const entry = diff.broken.find((b) => b.name === "model.options");
      expect(entry).toBeDefined();
      expect(entry.ours).toBe(true);
      // Ours sorts first: a lost method we call is a broken screen.
      expect(diff.broken[0].ours).toBe(true);
    });

    it("ловит исчезнувший маршрут, событие и маркер чекпойнта", () => {
      const after = snapshot({
        coreRestRoutes: {},
        gatewayEmittedEvents: ["status.update"],
        checkpointMarkers: [],
      });
      const names = diffSnapshots(snapshot(), after).broken.map((b) => b.name);
      expect(names).toContain("GET /api/profiles");
      expect(names).toContain("skin.changed");
      expect(names).toContain(".git");
    });
  });

  describe("появилось", () => {
    it("ловит новый метод, маршрут и событие", () => {
      const after = snapshot({
        coreRestRoutes: {
          "GET /api/profiles": "web_routers/profiles.py",
          "POST /api/voice/start": "web_server.py",
        },
        gatewayEmittedEvents: ["status.update", "skin.changed", "wake.detected"],
      });
      after.gatewayMethods["voice.start"] = {
        file: "methods_tools.py",
        lines: 5,
        hash: "cccc",
        defaults: {},
      };

      const names = diffSnapshots(snapshot(), after).added.map((a) => a.name);
      expect(names).toContain("voice.start");
      expect(names).toContain("POST /api/voice/start");
      expect(names).toContain("wake.detected");
      expect(diffSnapshots(snapshot(), after).broken).toEqual([]);
    });
  });

  describe("молча сменило умолчание", () => {
    it("ловит перевёрнутое умолчание параметра при неизменной сигнатуре", () => {
      // The 0.18 → 0.19 shape exactly: same name, same file, answers as before,
      // returns 3 providers instead of 41.
      const after = withMethod(snapshot(), "model.options", {
        defaults: { include_unconfigured: "False" },
      });

      const diff = diffSnapshots(snapshot(), after);
      expect(diff.broken).toEqual([]);
      expect(diff.added).toEqual([]);
      const entry = diff.silent.find((s) => s.name === "model.options");
      expect(entry.ours).toBe(true);
      expect(entry.notes).toContain("умолчание include_unconfigured: True → False");
    });

    it("ловит исчезнувшее умолчание — параметр стал обязательным", () => {
      const after = withMethod(snapshot(), "model.options", { defaults: {} });
      const entry = diffSnapshots(snapshot(), after).silent.find((s) => s.name === "model.options");
      expect(entry.notes[0]).toMatch(/умолчание include_unconfigured=True исчезло/);
    });

    it("ловит изменившийся дефолт конфига", () => {
      const after = snapshot({ configDefaults: { "agent.max_turns": 500, "agent.gateway_timeout": 1800 } });
      const entry = diffSnapshots(snapshot(), after).silent.find((s) => s.name === "agent.max_turns");
      expect(entry.notes).toContain("90 → 500");
    });

    it("ловит перепиненную зависимость как смену пина, а не как удаление плюс добавление", () => {
      const after = snapshot({ requiresDist: ['mcp==1.28.1', 'starlette==1.0.1 ; extra == "mcp"'] });
      const diff = diffSnapshots(snapshot(), after);
      expect(diff.broken).toEqual([]);
      expect(diff.added).toEqual([]);
      expect(diff.silent.find((s) => s.name === "mcp").notes).toContain("==1.26.0 → ==1.28.1");
    });

    it("различает переезд метода и изменение его тела", () => {
      const moved = withMethod(snapshot(), "session.list", { file: "server.py" });
      const rewritten = withMethod(snapshot(), "session.list", { hash: "zzzz", lines: 40 });

      expect(diffSnapshots(snapshot(), moved).silent[0].notes).toEqual([
        "переехал: methods_session.py → server.py",
      ]);
      expect(diffSnapshots(snapshot(), rewritten).silent[0].notes).toEqual([
        "тело изменилось (10 → 40 строк)",
      ]);
    });
  });

  describe("несравнимые разделы", () => {
    it("не выдаёт всё ядро за «появилось», когда старый слепок формата 1", () => {
      const old = {
        hermesVersion: "0.19.0",
        ourMethods: { "model.options": { file: "server.py", lines: 20, hash: "aaaa" } },
        ourRestRoutes: { "/api/profiles": true },
        gatewayEmittedEvents: ["status.update", "skin.changed"],
        checkpointMarkers: [".git"],
      };

      const diff = diffSnapshots(old, snapshot());
      expect(diff.comparable.gatewayMethods).toBe(false);
      expect(diff.comparable.configDefaults).toBe(false);
      expect(diff.defaultsComparable).toBe(false);
      // Falls back to our own surface, which the old format did record.
      expect(diff.silent.find((s) => s.name === "model.options").notes).toEqual([
        "переехал: server.py → methods_complete.py",
      ]);
      // The 141-method inventory is absent, not new.
      expect(diff.added.map((a) => a.name)).not.toContain("session.list");
    });

    it("не сравнивает умолчания против слепка, который их не записывал", () => {
      const old = {
        snapshotFormat: 1,
        hermesVersion: "0.19.0",
        ourMethods: { "model.options": { file: "methods_complete.py", lines: 20, hash: "aaaa" } },
      };
      const diff = diffSnapshots(old, snapshot());
      expect(diff.silent).toEqual([]);
      expect(formatReport(diff)).toContain("умолчания параметров не сравниваются");
    });
  });
});

describe("formatReport", () => {
  it("печатает три раздела и метку нашей поверхности", () => {
    const after = withMethod(snapshot(), "model.options", {
      defaults: { include_unconfigured: "False" },
    });
    const text = formatReport(diffSnapshots(snapshot(), after));

    expect(text).toContain("== сломалось (0)");
    expect(text).toContain("== появилось (0)");
    expect(text).toContain("== молча сменило умолчание (1)");
    expect(text).toContain("МЫ ЭТО ВЫЗЫВАЕМ");
  });
});
