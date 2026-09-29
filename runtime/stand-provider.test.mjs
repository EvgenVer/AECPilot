import { describe, expect, test } from "vitest";

import { standConfig } from "./stand-provider.mjs";

const BEFORE = [
  "model:",
  "  default: gpt-5-mini",
  "  provider: openai-api",
  "toolsets:",
  "  - hermes-cli",
  "memory:",
  "  provider: mem0",
  "# image_gen: провайдер генерации картинок — решение владельца 2026-09-24 (D-124).",
  "image_gen:",
  "  provider: openai",
  "",
].join("\n");

describe("стенд на Gemini (3G.8)", () => {
  test("модель и провайдер агента — пресет Gemini, остальное на месте", () => {
    const after = standConfig(BEFORE);
    expect(after).toContain("model:\n  default: gemini-3.8-flash\n  provider: gemini\n");
    expect(after).toContain("memory:\n  provider: mem0\n");
    expect(after).toContain("toolsets:\n  - hermes-cli\n");
    expect(after).not.toMatch(/openai|gpt-5/);
  });

  test("блок картинок снят, вместо него пометка D-156", () => {
    const after = standConfig(BEFORE);
    expect(after).not.toMatch(/^image_gen:/m);
    expect(after).toMatch(/^# image_gen: не задан .*D-156/m);
  });

  test("повторный запуск ничего не меняет", () => {
    const once = standConfig(BEFORE);
    expect(standConfig(once)).toBe(once);
  });

  test("CRLF сохраняется", () => {
    const after = standConfig(BEFORE.replace(/\n/g, "\r\n"));
    expect(after).toContain("  provider: gemini\r\n");
    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
  });

  test("смешанные окончания строк остаются как были", () => {
    const mixed =
      "model:\r\n  default: gpt-5-mini\r\n  provider: openai-api\r\nmemory:\n  provider: mem0\r\n";
    const after = standConfig(mixed);
    expect(after).toContain("memory:\n  provider: mem0\r\n");
    expect(after).toContain("  default: gemini-3.8-flash\r\n");
  });

  test("без блока model — отказ словами", () => {
    expect(() => standConfig("memory:\n  provider: mem0\n")).toThrow(/нет блока model/);
  });
});
