// Idempotently registers the `aec-sources` MCP server (mcp/aec_sources) in
// the isolated hermes dev profile's config.yaml (task 1.12).
//
// Mechanism (from runtime/.hermes-venv/Lib/site-packages/hermes_cli/mcp_config.py
// + tools/mcp_tool.py — see AECPilot TASKS.md task 1.12 for the write-up):
//   - MCP servers live under the `mcp_servers:` top-level key of
//     ~/.hermes/config.yaml (here: runtime/dev-profile/config.yaml), one
//     mapping per server name: `{command, args, env?, enabled}` for stdio
//     transport (`{url, headers?}` for HTTP — not used here).
//   - `tools.mcp_tool.discover_mcp_tools()` reads that key fresh whenever an
//     agent is built (session create) or on a `/reload-mcp` /
//     `reload.mcp` RPC — no separate "MCP config file" exists.
//   - Registered tool names get a `mcp_{server}_{tool}` prefix (hyphens in
//     the server name are sanitized to underscores), so `aec-sources`'s
//     `sources_list` tool is exposed as `mcp_aec_sources_sources_list`.
//
// Like apps/desktop/src/main/llm-settings-pure.ts (task 0.15/0.17 precedent),
// config.yaml is edited as text (no YAML parser dependency) so unrelated
// keys/comments/ordering survive untouched.
//
// Usage:
//   node runtime/register-aec-sources.mjs [projectJsonPath]
// With no argument, registers against the tracked fixture at
// runtime/fixtures/demo-vault/.aecpilot/project.json (its `root_path`
// placeholder is rewritten in place to the absolute path of
// runtime/fixtures/demo-source on this machine — never a committed absolute
// path).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_DIR, HERMES_HOME_DIR } from "./hermes-env.mjs";

const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");
const isWindows = process.platform === "win32"; // POSIX branch untested in Phase 0 (dev target = Windows)

export const AEC_SOURCES_BIN = isWindows
  ? path.join(REPO_ROOT, ".venv", "Scripts", "aec-sources.exe")
  : path.join(REPO_ROOT, ".venv", "bin", "aec-sources");

export const DEMO_SOURCE_DIR = path.join(RUNTIME_DIR, "fixtures", "demo-source");
export const DEMO_VAULT_PROJECT_JSON = path.join(
  RUNTIME_DIR,
  "fixtures",
  "demo-vault",
  ".aecpilot",
  "project.json",
);
const DEMO_SOURCE_ID = "demo";

export const CONFIG_PATH = path.join(HERMES_HOME_DIR, "config.yaml");

/**
 * Rewrites the tracked demo project.json's `root_path` (for source id
 * "demo") to the absolute path of runtime/fixtures/demo-source on this
 * machine. No-op if it already matches. Never called for a caller-supplied
 * projectJsonPath (only the default fixture is templated this way).
 */
export function ensureDemoFixtureProjectJson() {
  const raw = fs.readFileSync(DEMO_VAULT_PROJECT_JSON, "utf-8");
  const data = JSON.parse(raw);
  let changed = false;
  for (const source of data.sources ?? []) {
    if (source.id === DEMO_SOURCE_ID && source.root_path !== DEMO_SOURCE_DIR) {
      source.root_path = DEMO_SOURCE_DIR;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(DEMO_VAULT_PROJECT_JSON, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  }
  return changed;
}

const MCP_SERVERS_SECTION_RE = /^mcp_servers:\s*(#.*)?$/;
const MCP_SERVERS_SCALAR_RE = /^mcp_servers:\s*[^#\s]/;
const TOP_LEVEL_LINE_RE = /^\S/;
const INDENT2_LINE_RE = /^\s{0,2}\S/; // col 0 or 2-space indent (i.e. NOT a 4+-space child line)

/**
 * Merges an `aec-sources` stdio server entry into the `mcp_servers:` mapping
 * of a hermes config.yaml text, preserving every other top-level key, every
 * other configured MCP server, and all comments/ordering (mirrors
 * mergeApprovalsModeIntoConfigYaml in llm-settings-pure.ts). Fully manages
 * (overwrites) only the `aec-sources:` sub-block, since that entry is owned
 * by this script. Returns `{ text, changed }`; throws if `mcp_servers:` (or
 * `aec-sources:` within it) exists as a non-mapping scalar — that shape is
 * not handled by this line-based transform and must not be silently
 * clobbered.
 */
export function mergeAecSourcesIntoConfigYaml(yamlText, { command, args, enabled = true }) {
  const serverLines = [
    "  aec-sources:",
    `    command: ${JSON.stringify(command)}`,
    `    args: ${JSON.stringify(args)}`,
    `    enabled: ${enabled ? "true" : "false"}`,
  ];

  // Strip a single trailing "\n" before splitting, so the split doesn't
  // produce a synthetic trailing "" line-array entry that would otherwise
  // throw off the section-extent / unchanged-block comparisons below. The
  // output always ends with exactly one "\n" (see the two `return`s below).
  const hadTrailingNewline = yamlText.endsWith("\n");
  const lines = (hadTrailingNewline ? yamlText.slice(0, -1) : yamlText).split("\n");

  if (lines.some((line) => MCP_SERVERS_SCALAR_RE.test(line))) {
    throw new Error("config.yaml has `mcp_servers:` as a scalar, not a mapping — refusing to edit");
  }

  const sectionStart = lines.findIndex((line) => MCP_SERVERS_SECTION_RE.test(line));

  if (sectionStart === -1) {
    const separator = yamlText === "" || hadTrailingNewline ? "" : "\n";
    const block = ["mcp_servers:", ...serverLines].join("\n");
    return { text: `${yamlText}${separator}${block}\n`, changed: true };
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd);

  if (sectionLines.some((line) => /^  aec-sources:\s*[^#\s]/.test(line))) {
    throw new Error("config.yaml has `mcp_servers.aec-sources` as a scalar, not a mapping — refusing to edit");
  }

  const subStart = sectionLines.findIndex((line) => /^  aec-sources:\s*(#.*)?$/.test(line));

  let nextSectionLines;
  if (subStart === -1) {
    nextSectionLines = [...sectionLines, ...serverLines];
  } else {
    let subEnd = sectionLines.length;
    for (let i = subStart + 1; i < sectionLines.length; i++) {
      if (INDENT2_LINE_RE.test(sectionLines[i])) {
        subEnd = i;
        break;
      }
    }
    const before = sectionLines.slice(0, subStart);
    const after = sectionLines.slice(subEnd);
    const unchanged =
      sectionLines.slice(subStart, subEnd).join("\n") === serverLines.join("\n");
    if (unchanged) {
      return { text: yamlText, changed: false };
    }
    nextSectionLines = [...before, ...serverLines, ...after];
  }

  const nextLines = [
    ...lines.slice(0, sectionStart + 1),
    ...nextSectionLines,
    ...lines.slice(sectionEnd),
  ];

  return { text: `${nextLines.join("\n")}\n`, changed: true };
}

/**
 * Registers `aec-sources` against `projectJsonPath` (default: the tracked
 * demo fixture, whose `root_path` placeholder is rewritten first). Returns
 * `{ projectJsonPath, command, configPath, changed }`.
 */
export function registerAecSources({ projectJsonPath } = {}) {
  if (!fs.existsSync(AEC_SOURCES_BIN)) {
    throw new Error(
      `aec-sources binary not found at ${AEC_SOURCES_BIN} — run 'uv sync' (mcp/aec_sources) first`,
    );
  }

  let resolvedProjectJsonPath;
  if (projectJsonPath) {
    resolvedProjectJsonPath = path.resolve(projectJsonPath);
  } else {
    ensureDemoFixtureProjectJson();
    resolvedProjectJsonPath = DEMO_VAULT_PROJECT_JSON;
  }

  const existing = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf-8") : "";
  const { text, changed } = mergeAecSourcesIntoConfigYaml(existing, {
    command: AEC_SOURCES_BIN,
    args: ["--project", resolvedProjectJsonPath],
    enabled: true,
  });

  if (changed) {
    fs.mkdirSync(HERMES_HOME_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, text, "utf-8");
  }

  return { projectJsonPath: resolvedProjectJsonPath, command: AEC_SOURCES_BIN, configPath: CONFIG_PATH, changed };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = registerAecSources({ projectJsonPath: process.argv[2] });
  console.log(`== aec-sources registered in ${result.configPath} (changed=${result.changed})`);
  console.log(`== command: ${result.command}`);
  console.log(`== project.json: ${result.projectJsonPath}`);
}
