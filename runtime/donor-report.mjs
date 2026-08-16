// Measures a donor version bump before it happens, in two numbers that decide
// different things:
//
//   план повторного переноса — which of OUR vendored files the donor changed,
//                              edited ones first (their edits are re-applied by
//                              hand, everything else is a re-copy)
//   churn по поверхностям    — how much each donor area moved, so a task can be
//                              classified «переносим сейчас» vs «ждём подъёма»
//
// The second is what this tool exists for. Their patch releases ship without
// curated notes — 0.20.1 and 0.20.2 rolled up 656 and 397 PRs behind one line
// each, with the real notes promised for 0.21.0 — so the tree is the only
// source of truth about what moved. And an area with zero churn is a free
// port: the file lands byte-identical whether it comes from the old SHA or the
// new one, which is how Phase 3A was carved out of Phase 3 (PLAN §Слой донора).
//
// Reads the donor checkout that the core install already keeps at DONOR_SHA.
// Comparing against a ref we have NOT pinned is the point, so the ref only has
// to be fetched, never checked out:
//
//   git -C runtime/.hermes-src fetch --depth=1 --no-tags origin \
//       refs/tags/<their-tag>:refs/aecpilot/<our-name>
//
// Usage:
//   node runtime/donor-report.mjs <to-ref>              — from DONOR_SHA
//   node runtime/donor-report.mjs <from-ref> <to-ref>
//   node runtime/donor-report.mjs <to-ref> --json out.json

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { RUNTIME_DIR } from "./hermes-env.mjs";
import { DONOR_ROOT, DONOR_SHA } from "./donor-env.mjs";

const VENDOR_DIR = path.resolve(RUNTIME_DIR, "..", "apps/desktop/src/renderer/src/donor");

// Both source roots the vendor zone draws from — their desktop (renderer +
// electron main) and the shared package their desktop imports as `@hermes/shared`
// (see vendor-donor.mjs). Diffing whole roots in one call instead of passing 700
// paths keeps the command line under the Windows 8191-character limit.
const DIFF_ROOTS = ["apps/desktop", "apps/shared"];

/** Provenance header of one vendored file (donor/README.md defines the shape).
 *
 * `edited` comes from the `Edits:` line, NOT from the inline `EDIT [n]` marker:
 * an edit of the "dropped an import we do not have" kind leaves no marker in the
 * body, only a header entry. Counting markers undercounts — 18 files instead of
 * the 22 the zone actually carries. */
export function parseHeader(text) {
  // The header has to START the file, the way vendor-donor.mjs writes it.
  // donor/README.md documents the format by quoting a filled-in example, and a
  // looser match takes that example for a 721st vendored file — putting a path
  // we never ported into the re-port plan.
  if (!text.startsWith("/**\n * Vendored from Hermes Desktop") &&
      !text.startsWith("/**\r\n * Vendored from Hermes Desktop")) {
    return null;
  }
  const source = /^ \* Source:\s+(.+?)\s*$/m.exec(text);
  const commit = /^ \* Commit:\s+([0-9a-f]{40})/m.exec(text);
  const edits = /^ \* Edits:\s*(.*)$/m.exec(text);
  if (!source) return null;
  return {
    source: source[1],
    commit: commit ? commit[1] : null,
    edited: edits ? edits[1].trim() !== "none" : false,
  };
}

/** `git diff --name-status` → path → 'A' | 'M' | 'D'. Run with --no-renames on
 * purpose: a renamed file means our vendored copy points at a path that no
 * longer exists, and that has to read as a deletion, not as a quiet move. */
export function parseNameStatus(output) {
  const out = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z])\t(.+)$/.exec(line);
    if (match) out.set(match[2], match[1]);
  }
  return out;
}

/** `git diff --numstat` → path → {added, deleted}. Binary files report `-`; they
 * still changed, so they land with zero counts rather than being dropped. */
export function parseNumstat(output) {
  const out = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(line);
    if (!match) continue;
    const [, added, deleted, file] = match;
    out.set(file, {
      added: added === "-" ? 0 : Number(added),
      deleted: deleted === "-" ? 0 : Number(deleted),
      binary: added === "-",
    });
  }
  return out;
}

/** The surface a donor path belongs to, at the granularity a TASKS entry names:
 * two levels under their `src/`, one bucket for the electron main process, one
 * for the shared package. */
export function surfaceOf(file) {
  const src = file.replace(/^apps\/desktop\/src\//, "");
  if (src !== file) return src.split("/").slice(0, 2).join("/");
  if (file.startsWith("apps/desktop/electron/")) return "electron";
  if (file.startsWith("apps/shared/src/")) return "shared";
  return path.posix.dirname(file);
}

/**
 * Builds the report. Pure: takes what was read, returns what is printed.
 *
 * `vendored` — [{ vendored, source, edited }] from our zone.
 * `status`, `numstat` — the two git maps, keyed by donor path.
 */
export function buildReport({ vendored, status, numstat, from, to }) {
  const changed = [];
  const vanished = [];

  for (const entry of vendored) {
    const state = status.get(entry.source);
    if (!state) continue;
    const lines = numstat.get(entry.source) ?? { added: 0, deleted: 0, binary: false };
    const row = { ...entry, ...lines, status: state, churn: lines.added + lines.deleted };
    if (state === "D") vanished.push(row);
    else changed.push(row);
  }

  // Edited files first: a re-copy is mechanical, re-applying an edit is not, and
  // the whole point of the header is that the second list stays small enough to
  // do by hand.
  changed.sort((a, b) => Number(b.edited) - Number(a.edited) || b.churn - a.churn);
  vanished.sort((a, b) => Number(b.edited) - Number(a.edited));

  // Churn covers the WHOLE donor tree, not just what we ported: the question
  // "is this surface rewritten" has to be answerable for surfaces we have not
  // touched yet — that is what classifies a task into 3A or 3B.
  const surfaces = new Map();
  for (const [file, state] of status) {
    const key = surfaceOf(file);
    const lines = numstat.get(file) ?? { added: 0, deleted: 0 };
    const bucket = surfaces.get(key) ?? { surface: key, changed: 0, added: 0, deleted: 0, plus: 0, minus: 0 };
    bucket.changed += 1;
    if (state === "A") bucket.added += 1;
    if (state === "D") bucket.deleted += 1;
    bucket.plus += lines.added;
    bucket.minus += lines.deleted;
    surfaces.set(key, bucket);
  }

  return {
    from,
    to,
    vendoredTotal: vendored.length,
    editedTotal: vendored.filter((v) => v.edited).length,
    changed,
    vanished,
    surfaces: [...surfaces.values()].sort((a, b) => b.plus + b.minus - (a.plus + a.minus)),
  };
}

/** Renders the report as the text a human reads before deciding to bump. */
export function formatReport(report) {
  const lines = [];
  const editedChanged = report.changed.filter((r) => r.edited).length;

  lines.push(`замер донора: ${report.from.ref} → ${report.to.ref}`);
  lines.push(`  ${report.from.sha}`);
  lines.push(`  ${report.to.sha}`);
  lines.push("");
  lines.push(
    `перенесено файлов: ${report.vendoredTotal} (из них с нашими правками: ${report.editedTotal})`,
  );
  lines.push(
    `изменились у донора: ${report.changed.length}` +
      (editedChanged > 0 ? `, из них правленых: ${editedChanged}` : ""),
  );
  if (report.vanished.length > 0) {
    lines.push(`ИСТОЧНИК ИСЧЕЗ (переименован или удалён): ${report.vanished.length}`);
  }

  if (report.vanished.length > 0) {
    lines.push("", `== источник исчез (${report.vanished.length}) — переносить неоткуда, разбирать поимённо`);
    for (const row of report.vanished) {
      lines.push(`  ${row.source}${row.edited ? "   ✎ ПРАВКИ" : ""}`);
    }
  }

  lines.push("", `== план повторного переноса (${report.changed.length})`);
  if (report.changed.length === 0) lines.push("  ничего — зона совпадает с этой версией");
  for (const row of report.changed) {
    const size = row.binary ? "бинарный" : `+${row.added}/-${row.deleted}`;
    lines.push(`  ${row.edited ? "✎" : " "} ${size.padEnd(14)} ${row.source}`);
  }
  if (editedChanged > 0) {
    lines.push(
      "",
      `  ✎ — ${editedChanged} файлов несут наши правки: их перенос НЕ механический,`,
      "      правки восстанавливаются по списку в заголовке файла (§Слой донора).",
    );
  }

  lines.push("", `== churn по поверхностям донора (${report.surfaces.length})`);
  lines.push("  изменено/новых   строки            поверхность");
  for (const s of report.surfaces) {
    const counts = `${s.changed}/${s.added}`.padEnd(16);
    const churn = `+${s.plus}/-${s.minus}`.padEnd(18);
    lines.push(`  ${counts} ${churn}${s.surface}`);
  }
  lines.push(
    "",
    "  нулевой churn = перенос даст побайтово тот же файл, что и после подъёма пина;",
    "  заметный = поверхность переписана, перенос сейчас будет оплачен дважды.",
  );

  return lines.join("\n");
}

/** Every vendored file that carries a provenance header. Files without one are
 * not theirs (LICENSE.donor, README.md, our own i18n catalogs sit alongside). */
function readVendorZone(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      // Only the first bytes can hold the header; a 4 MB font read whole would
      // dominate the run time of the whole tool.
      const handle = fs.openSync(full, "r");
      const buffer = Buffer.alloc(1024);
      const read = fs.readSync(handle, buffer, 0, 1024, 0);
      fs.closeSync(handle);
      const header = parseHeader(buffer.subarray(0, read).toString("utf8"));
      if (!header) continue;
      out.push({ vendored: path.relative(dir, full).replace(/\\/g, "/"), ...header });
    }
  };
  walk(dir);
  return out.sort((a, b) => a.source.localeCompare(b.source));
}

function git(args) {
  return execFileSync("git", ["-C", DONOR_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function resolve(ref) {
  try {
    return git(["rev-parse", `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(
      `ref не найден в ${DONOR_ROOT}: ${ref}\n` +
        `подтяните его, не переключая дерево:\n` +
        `  git -C runtime/.hermes-src fetch --depth=1 --no-tags origin refs/tags/<тег>:refs/aecpilot/<имя>`,
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf("--json");
  const jsonPath = jsonAt === -1 ? null : argv[jsonAt + 1];
  // `jsonAt + 1` is only the flag's value when the flag is actually present —
  // with jsonAt === -1 it would silently eat argv[0], the ref.
  const jsonValueAt = jsonAt === -1 ? -1 : jsonAt + 1;
  const refs = argv.filter((a, i) => !a.startsWith("--") && i !== jsonValueAt);

  if (refs.length === 0 || refs.length > 2) {
    console.error("usage: node runtime/donor-report.mjs [<from-ref>] <to-ref> [--json <path>]");
    process.exit(2);
  }
  const [fromRef, toRef] = refs.length === 2 ? refs : [DONOR_SHA, refs[0]];
  const from = { ref: refs.length === 2 ? fromRef : `DONOR_SHA (${DONOR_SHA.slice(0, 8)})`, sha: resolve(fromRef) };
  const to = { ref: toRef, sha: resolve(toRef) };

  const report = buildReport({
    vendored: readVendorZone(VENDOR_DIR),
    status: parseNameStatus(git(["diff", "--name-status", "--no-renames", from.sha, to.sha, "--", ...DIFF_ROOTS])),
    numstat: parseNumstat(git(["diff", "--numstat", "--no-renames", from.sha, to.sha, "--", ...DIFF_ROOTS])),
    from,
    to,
  });

  console.log(formatReport(report));
  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\nмашиночитаемый отчёт: ${jsonPath}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
