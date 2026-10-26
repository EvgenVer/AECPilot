// Idempotently registers the `aec-sources` MCP server (mcp/aec_sources) in
// the isolated hermes dev profile's config.yaml (task 1.12).
//
// Mechanism (from `hermes_cli/mcp_config.py` in the core checkout
// + tools/mcp_tool.py — the write-up is task 1.12 in the ledger before 2026-08-05, `git show 64fa482^:TASKS.md`):
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
// With no argument, registers against a *materialized copy* of the tracked
// fixture template at runtime/fixtures/demo-vault/.aecpilot/project.json:
// that template's `root_path` placeholder (`__DEMO_SOURCE_ROOT__`) is
// substituted with the absolute path of runtime/fixtures/demo-source on this
// machine, and the result is written to
// runtime/dev-profile/aec-demo-vault/.aecpilot/project.json — inside
// runtime/dev-profile, which is already fully gitignored (task 0.6). The
// tracked template itself is only ever read, never written, so it stays
// clean (placeholder-only) in git regardless of how many times this script
// runs or on which machine.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_DIR, HERMES_HOME_DIR, mcpServerCommand } from "./hermes-env.mjs";


// Development: the workspace's console script; installed: `python -m aec_sources`
// with our staged interpreter (hermes-env.mjs::mcpServerCommand, task T22).
const AEC_SOURCES_COMMAND = mcpServerCommand("aec-sources");
export const AEC_SOURCES_BIN = AEC_SOURCES_COMMAND.command;
export const AEC_SOURCES_ARGS = AEC_SOURCES_COMMAND.args;

export const DEMO_SOURCE_DIR = path.join(RUNTIME_DIR, "fixtures", "demo-source");

// Tracked template — read-only, never written by this script. Its
// `root_path` is the literal placeholder `__DEMO_SOURCE_ROOT__`.
export const DEMO_VAULT_TEMPLATE_PROJECT_JSON = path.join(
  RUNTIME_DIR,
  "fixtures",
  "demo-vault",
  ".aecpilot",
  "project.json",
);

// Materialized working copy — inside runtime/dev-profile (gitignored), so
// substituting the real absolute path here never dirties a tracked file.
export const DEMO_VAULT_MATERIALIZED_PROJECT_JSON = path.join(
  HERMES_HOME_DIR,
  "aec-demo-vault",
  ".aecpilot",
  "project.json",
);

const DEMO_SOURCE_ID = "demo";
const DEMO_ROOT_PLACEHOLDER = "__DEMO_SOURCE_ROOT__";

export const CONFIG_PATH = path.join(HERMES_HOME_DIR, "config.yaml");

/**
 * Reads the tracked demo project.json template, substitutes its `root_path`
 * placeholder (for source id "demo") with the absolute path of
 * runtime/fixtures/demo-source on this machine, and writes the result to
 * `DEMO_VAULT_MATERIALIZED_PROJECT_JSON` (gitignored). The template itself
 * is never modified. Returns the materialized path.
 */
export function materializeDemoFixtureProjectJson() {
  const raw = fs.readFileSync(DEMO_VAULT_TEMPLATE_PROJECT_JSON, "utf-8");
  const data = JSON.parse(raw);
  for (const source of data.sources ?? []) {
    if (source.id === DEMO_SOURCE_ID && source.root_path === DEMO_ROOT_PLACEHOLDER) {
      source.root_path = DEMO_SOURCE_DIR;
    }
  }
  fs.mkdirSync(path.dirname(DEMO_VAULT_MATERIALIZED_PROJECT_JSON), { recursive: true });
  fs.writeFileSync(
    DEMO_VAULT_MATERIALIZED_PROJECT_JSON,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf-8",
  );
  return DEMO_VAULT_MATERIALIZED_PROJECT_JSON;
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
export function mergeAecSourcesIntoConfigYaml(yamlText, options) {
  return mergeMcpServerIntoConfigYaml(yamlText, "aec-sources", options);
}

/** The same merge for any server name — `aec-rag` registers through it
 * (task 2.12). Only the named sub-block is managed; every other top-level key,
 * every other configured server and all comments/ordering survive untouched. */
export function mergeMcpServerIntoConfigYaml(yamlText, name, { command, args, env, enabled = true }) {
  // `env` values are written as `${env:VAR}` references by the caller, never as
  // values: hermes filters its own environment before spawning an MCP child
  // (`_build_safe_env`), so a server that needs a provider key must name it —
  // and naming it as a reference keeps the secret in our safeStorage and out of
  // config.yaml (rule R2).
  const envLines = env
    ? ["    env:", ...Object.entries(env).map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`)]
    : [];
  const serverLines = [
    `  ${name}:`,
    `    command: ${JSON.stringify(command)}`,
    `    args: ${JSON.stringify(args)}`,
    ...envLines,
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

  const scalarEntry = new RegExp(`^  ${name}:\\s*[^#\\s]`);
  if (sectionLines.some((line) => scalarEntry.test(line))) {
    throw new Error(
      `config.yaml has \`mcp_servers.${name}\` as a scalar, not a mapping — refusing to edit`,
    );
  }

  const mappingEntry = new RegExp(`^  ${name}:\\s*(#.*)?$`);
  const subStart = sectionLines.findIndex((line) => mappingEntry.test(line));

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
 * Registers `aec-sources` against `projectJsonPath` (default: a materialized
 * copy of the tracked demo fixture template — see
 * `materializeDemoFixtureProjectJson`). Returns
 * `{ projectJsonPath, command, configPath, changed }`.
 */
export function registerAecSources({ projectJsonPath } = {}) {
  if (!fs.existsSync(AEC_SOURCES_BIN)) {
    throw new Error(
      `aec-sources binary not found at ${AEC_SOURCES_BIN} — run 'uv sync' (mcp/aec_sources) first`,
    );
  }

  const resolvedProjectJsonPath = projectJsonPath
    ? path.resolve(projectJsonPath)
    : materializeDemoFixtureProjectJson();

  const existing = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf-8") : "";
  const { text, changed } = mergeAecSourcesIntoConfigYaml(existing, {
    command: AEC_SOURCES_BIN,
    args: [...AEC_SOURCES_ARGS, "--project", resolvedProjectJsonPath],
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
