// Tests for the config.yaml edits that make the agent see this project's index
// and our skill pack (task 2.12). Pure text transforms — no hermes profile is
// touched here; `registerAecRag` itself is the thin wrapper that writes them.

import { describe, expect, it } from "vitest";
import { mergeMcpServerIntoConfigYaml } from "./register-aec-sources.mjs";
import { mergeSkillsDirIntoConfigYaml } from "./register-aec-rag.mjs";

const RAG = {
  command: "C:\\repo\\.venv\\Scripts\\aec-rag.exe",
  args: ["serve", "--project", "C:\\vault\\.aecpilot\\project.json"],
  env: { OPENAI_API_KEY: "${env:OPENAI_API_KEY}" },
};

describe("mergeMcpServerIntoConfigYaml", () => {
  it("adds the server with its env block into an empty config", () => {
    const { text, changed } = mergeMcpServerIntoConfigYaml("", "aec-rag", RAG);

    expect(changed).toBe(true);
    expect(text).toContain("mcp_servers:");
    expect(text).toContain("  aec-rag:");
    expect(text).toContain("    env:");
    expect(text).toContain('      OPENAI_API_KEY: "${env:OPENAI_API_KEY}"');
  });

  it("writes a second env var as a literal — the skill path is not a secret (UR26)", () => {
    // `rag_check_quote` borrows the matcher from the `grounded-citations` skill
    // and needs to find it; hermes strips its own HERMES_HOME before spawning
    // an MCP child, so the path is handed over here. A reference (`${env:…}`)
    // would resolve to nothing for the same reason.
    const { text } = mergeMcpServerIntoConfigYaml("", "aec-rag", {
      ...RAG,
      env: { ...RAG.env, AEC_HERMES_HOME: "C:\\repo\\runtime\\dev-profile" },
    });

    expect(text).toContain('      OPENAI_API_KEY: "${env:OPENAI_API_KEY}"');
    expect(text).toMatch(/AEC_HERMES_HOME: "C:\\\\repo\\\\runtime\\\\dev-profile"/);
  });

  it("keeps the key a reference — a value in config.yaml would be a plaintext secret", () => {
    const { text } = mergeMcpServerIntoConfigYaml("", "aec-rag", RAG);

    expect(text).not.toMatch(/OPENAI_API_KEY:\s*"sk-/);
    expect(text).toMatch(/\$\{env:OPENAI_API_KEY\}/);
  });

  it("leaves another server and every unrelated key alone", () => {
    const before = [
      "model:",
      "  provider: openai",
      "mcp_servers:",
      "  aec-sources:",
      '    command: "C:\\\\repo\\\\.venv\\\\Scripts\\\\aec-sources.exe"',
      '    args: ["--project","C:\\\\vault\\\\.aecpilot\\\\project.json"]',
      "    enabled: true",
      "display:",
      "  theme: dark",
      "",
    ].join("\n");

    const { text, changed } = mergeMcpServerIntoConfigYaml(before, "aec-rag", RAG);

    expect(changed).toBe(true);
    expect(text).toContain("  aec-sources:");
    expect(text).toContain("  provider: openai");
    expect(text).toContain("  theme: dark");
    expect(text).toContain("  aec-rag:");
  });

  it("is idempotent — registering the same project twice changes nothing", () => {
    const first = mergeMcpServerIntoConfigYaml("", "aec-rag", RAG);
    const second = mergeMcpServerIntoConfigYaml(first.text, "aec-rag", RAG);

    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it("replaces the entry when the project changes", () => {
    const first = mergeMcpServerIntoConfigYaml("", "aec-rag", RAG);
    const moved = {
      ...RAG,
      args: ["serve", "--project", "C:\\другой\\.aecpilot\\project.json"],
    };

    const second = mergeMcpServerIntoConfigYaml(first.text, "aec-rag", moved);

    expect(second.changed).toBe(true);
    expect(second.text).toContain("другой");
    expect(second.text).not.toContain('"C:\\\\vault\\\\.aecpilot\\\\project.json"');
    expect(second.text.match(/^ {2}aec-rag:$/gm)).toHaveLength(1);
  });
});

describe("mergeSkillsDirIntoConfigYaml", () => {
  it("points hermes at our skill pack", () => {
    const { text, changed } = mergeSkillsDirIntoConfigYaml("", "C:\\repo\\skills");

    expect(changed).toBe(true);
    expect(text).toContain("skills:");
    expect(text).toContain("  external_dirs:");
    expect(text).toContain('    - "C:\\\\repo\\\\skills"');
  });

  it("is idempotent", () => {
    const first = mergeSkillsDirIntoConfigYaml("", "C:\\repo\\skills");
    const second = mergeSkillsDirIntoConfigYaml(first.text, "C:\\repo\\skills");

    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it("keeps a directory somebody else configured", () => {
    const before = ["skills:", "  external_dirs:", '    - "D:\\\\мои-скилы"', ""].join("\n");

    const { text, changed } = mergeSkillsDirIntoConfigYaml(before, "C:\\repo\\skills");

    expect(changed).toBe(true);
    expect(text).toContain('- "D:\\\\мои-скилы"');
    expect(text).toContain('- "C:\\\\repo\\\\skills"');
  });

  it("adds external_dirs under an existing skills section without touching its keys", () => {
    const before = ["skills:", "  enabled: true", "display:", "  theme: dark", ""].join("\n");

    const { text } = mergeSkillsDirIntoConfigYaml(before, "C:\\repo\\skills");

    expect(text).toContain("  enabled: true");
    expect(text).toContain("  external_dirs:");
    expect(text).toContain("  theme: dark");
  });
});
