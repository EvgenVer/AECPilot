// Registers the `aec-rag` MCP server and our skill pack in the hermes profile
// (task 2.12).
//
// Two edits to config.yaml, both idempotent and both text-level (no YAML
// parser dependency), same as runtime/register-aec-sources.mjs:
//
//   1. `mcp_servers.aec-rag` — stdio server, `aec-rag serve --project <...>`,
//      so the agent gets rag_ingest / rag_status / rag_query / rag_overview /
//      rag_graph_* for the open project. Registered tool names carry hermes's
//      `mcp_{server}_{tool}` prefix with hyphens sanitized, i.e.
//      `mcp_aec_rag_rag_query`.
//   2. `skills.external_dirs` — our repo's `skills/` directory, read by
//      `agent/skill_utils.get_external_skills_dirs`. Pointing at the repo
//      rather than copying files into the profile means a skill edit takes
//      effect on the next `skills.reload`, and the profile never holds a stale
//      fork of a skill that lives in git.
//
// Usage:
//   node runtime/register-aec-rag.mjs <projectJsonPath>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_DIR, HERMES_HOME_DIR } from "./hermes-env.mjs";
import { mergeMcpServerIntoConfigYaml } from "./register-aec-sources.mjs";

const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");
const isWindows = process.platform === "win32";

export const AEC_RAG_BIN = isWindows
  ? path.join(REPO_ROOT, ".venv", "Scripts", "aec-rag.exe")
  : path.join(REPO_ROOT, ".venv", "bin", "aec-rag");

export const SKILLS_DIR = path.join(REPO_ROOT, "skills");
export const CONFIG_PATH = path.join(HERMES_HOME_DIR, "config.yaml");

const EXTERNAL_DIRS_SECTION_RE = /^skills:\s*(#.*)?$/;
const TOP_LEVEL_LINE_RE = /^\S/;

/**
 * Merges `skills.external_dirs: [<dir>]` into a hermes config.yaml text,
 * leaving every other key alone. Returns `{ text, changed }`. An existing
 * `external_dirs` list that already contains the directory is left untouched;
 * one that does not is replaced wholesale — the key is ours to manage, the
 * rest of `skills:` is not.
 */
export function mergeSkillsDirIntoConfigYaml(yamlText, directory) {
  const entry = `    - ${JSON.stringify(directory)}`;
  const block = ["skills:", "  external_dirs:", entry];

  const hadTrailingNewline = yamlText.endsWith("\n");
  const lines = (hadTrailingNewline ? yamlText.slice(0, -1) : yamlText).split("\n");

  const sectionStart = lines.findIndex((line) => EXTERNAL_DIRS_SECTION_RE.test(line));
  if (sectionStart === -1) {
    const separator = yamlText === "" || hadTrailingNewline ? "" : "\n";
    return { text: `${yamlText}${separator}${block.join("\n")}\n`, changed: true };
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd);
  const listStart = sectionLines.findIndex((line) => /^  external_dirs:\s*(#.*)?$/.test(line));

  if (listStart === -1) {
    const nextSection = [...sectionLines, "  external_dirs:", entry];
    return {
      text: [
        ...lines.slice(0, sectionStart + 1),
        ...nextSection,
        ...lines.slice(sectionEnd),
      ].join("\n") + "\n",
      changed: true,
    };
  }

  let listEnd = sectionLines.length;
  for (let i = listStart + 1; i < sectionLines.length; i++) {
    if (!/^\s{4,}-\s/.test(sectionLines[i])) {
      listEnd = i;
      break;
    }
  }

  const items = sectionLines.slice(listStart + 1, listEnd);
  // Compared against the *quoted* form: on Windows the path is written with
  // JSON-escaped backslashes, so a raw `includes(directory)` never matches its
  // own output and the same directory is appended on every open.
  const already = items.some((line) => line.includes(JSON.stringify(directory)));
  if (already) {
    return { text: yamlText, changed: false };
  }

  const nextSection = [
    ...sectionLines.slice(0, listStart + 1),
    ...items,
    entry,
    ...sectionLines.slice(listEnd),
  ];
  return {
    text: [
      ...lines.slice(0, sectionStart + 1),
      ...nextSection,
      ...lines.slice(sectionEnd),
    ].join("\n") + "\n",
    changed: true,
  };
}

/**
 * Registers `aec-rag` against `projectJsonPath` and points hermes at our skill
 * pack. Returns `{ projectJsonPath, command, configPath, changed }`; `changed`
 * is true if either edit changed anything, which is what tells the caller a
 * `reload.mcp` is worth doing.
 */
export function registerAecRag({ projectJsonPath } = {}) {
  if (!fs.existsSync(AEC_RAG_BIN)) {
    throw new Error(`aec-rag binary not found at ${AEC_RAG_BIN} — run 'uv sync' first`);
  }
  if (!projectJsonPath) {
    throw new Error("registerAecRag needs a projectJsonPath");
  }

  const resolved = path.resolve(projectJsonPath);
  const existing = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf-8") : "";

  const server = mergeMcpServerIntoConfigYaml(existing, "aec-rag", {
    command: AEC_RAG_BIN,
    args: ["serve", "--project", resolved],
    // A reference, not a value. Hermes strips its own environment before
    // spawning an MCP child (`tools/mcp_tool._build_safe_env`), so without this
    // line the server has no provider key and every query fails; with the value
    // instead of the reference the key would sit in config.yaml in plain text,
    // which rule R2 forbids. `${env:VAR}` is resolved from the hermes process
    // environment, where our safeStorage put it at spawn time.
    env: { OPENAI_API_KEY: "${env:OPENAI_API_KEY}" },
    enabled: true,
  });
  const skills = fs.existsSync(SKILLS_DIR)
    ? mergeSkillsDirIntoConfigYaml(server.text, SKILLS_DIR)
    : { text: server.text, changed: false };

  const changed = server.changed || skills.changed;
  if (changed) {
    fs.mkdirSync(HERMES_HOME_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, skills.text, "utf-8");
  }

  return { projectJsonPath: resolved, command: AEC_RAG_BIN, configPath: CONFIG_PATH, changed };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = registerAecRag({ projectJsonPath: process.argv[2] });
  console.log(`== aec-rag registered in ${result.configPath} (changed=${result.changed})`);
  console.log(`== command: ${result.command}`);
  console.log(`== skills dir: ${SKILLS_DIR}`);
}
