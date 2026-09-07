// Задача 3E.4 (R22). Тесты держат САМ ЗАМЕР, а не его результат: разбор
// исходника ядра обязан ломаться заметно, иначе «расхождений нет» однажды
// станет означать «ничего не нашли, потому что перестали искать».

import { describe, expect, it } from "vitest";

import { compare, coveredByCore, EXPECTED, readCoreUntrusted } from "./untrusted-tools.mjs";

const CORE_SOURCE = `
_UNTRUSTED_TOOL_NAMES = frozenset({
    "web_extract",
    "web_search",
})

_UNTRUSTED_TOOL_PREFIXES = (
    "browser_",
    "mcp_",
)

_UNTRUSTED_WRAP_MIN_CHARS = 32
`;

const OUR_WRAPPER = `
const WRAP_MIN_CHARS = 32
'<untrusted_tool_result source="desktop_preview">\\n'
`;

describe("readCoreUntrusted", () => {
  it("снимает имена, префиксы и порог", () => {
    expect(readCoreUntrusted(CORE_SOURCE)).toEqual({
      names: ["web_extract", "web_search"],
      prefixes: ["browser_", "mcp_"],
      minChars: 32,
    });
  });

  it("исходник без этих блоков даёт пустоту, а не выдуманное покрытие", () => {
    // Если ядро переименует блок, замер обязан сказать «пусто» и уронить
    // сверку ниже, а не тихо согласиться.
    expect(readCoreUntrusted("ничего похожего")).toEqual({
      names: [],
      prefixes: [],
      minChars: null,
    });
  });
});

describe("coveredByCore", () => {
  const core = readCoreUntrusted(CORE_SOURCE);

  it("имя и префикс считаются покрытием", () => {
    expect(coveredByCore("web_search", core)).toBe(true);
    expect(coveredByCore("browser_click", core)).toBe(true);
    expect(coveredByCore("mcp_aec_rag_ask", core)).toBe(true);
  });

  it("инструмент нашей панели ядром НЕ покрыт — ради этого всё и затевалось", () => {
    expect(coveredByCore("desktop_preview", core)).toBe(false);
  });
});

describe("compare", () => {
  it("текущее состояние расхождений не даёт", () => {
    expect(compare(readCoreUntrusted(CORE_SOURCE), OUR_WRAPPER)).toEqual([]);
  });

  it("ядро перестало помечать веб — это расхождение, а не мелочь", () => {
    const core = readCoreUntrusted(CORE_SOURCE.replace('"web_search",', ""));
    expect(compare(core, OUR_WRAPPER).join(" ")).toContain("web_search");
  });

  it("ядро начало помечать нашу панель само — говорим про ДВЕ рамки", () => {
    const core = readCoreUntrusted(
      CORE_SOURCE.replace('"web_search",', '"web_search",\n    "desktop_preview",'),
    );
    const problems = compare(core, OUR_WRAPPER).join(" ");
    expect(problems).toContain("две рамки");
    expect(problems).toContain("markUntrustedPageText");
  });

  it("наша рамка исчезла — расхождение", () => {
    expect(compare(readCoreUntrusted(CORE_SOURCE), "const WRAP_MIN_CHARS = 32").join(" ")).toContain(
      "исчезла",
    );
  });

  it("порог разошёлся с ядром — расхождение", () => {
    const ours = OUR_WRAPPER.replace("WRAP_MIN_CHARS = 32", "WRAP_MIN_CHARS = 64");
    expect(compare(readCoreUntrusted(CORE_SOURCE), ours).join(" ")).toContain("порог");
  });
});

describe("EXPECTED", () => {
  it("ожидание непустое: пустой список сверял бы ничто", () => {
    expect(EXPECTED.names.length).toBeGreaterThan(0);
    expect(EXPECTED.prefixes.length).toBeGreaterThan(0);
    expect(EXPECTED.uncovered).toContain("desktop_preview");
  });
});
