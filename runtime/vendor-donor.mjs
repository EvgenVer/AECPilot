// Copies files out of the pinned donor checkout into our vendor zone, stamping
// each one with the provenance header the zone requires
// (apps/desktop/src/renderer/src/donor/README.md).
//
//   node runtime/vendor-donor.mjs i18n/types.ts lib/text.ts …
//   node runtime/vendor-donor.mjs --list <file-with-one-path-per-line>
//
// Paths are relative to their `apps/desktop/src`. Existing files are
// overwritten — that is the update path: re-copy from the new DONOR_SHA and
// re-apply the edits the old header listed. Editing a vendored file by hand
// afterwards means updating its `Edits:` list by hand too; this script only
// ever writes `Edits: none`, because a fresh copy has none.

import fs from "node:fs";
import path from "node:path";

import { RUNTIME_DIR } from "./hermes-env.mjs";
import { DONOR_SHA, DONOR_TAG, DONOR_SRC_DIR, checkDonorTree } from "./donor-env.mjs";

const VENDOR_DIR = path.resolve(RUNTIME_DIR, "..", "apps/desktop/src/renderer/src/donor");

function header(source) {
  return [
    "/**",
    " * Vendored from Hermes Desktop — do not refactor. See donor/README.md.",
    ` * Source:  ${source}`,
    ` * Commit:  ${DONOR_SHA} (${DONOR_TAG})`,
    " * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)",
    " * Edits: none",
    " */",
    ""
  ].join("\n");
}

// Their monorepo has a second source root: `apps/shared/src`, published to
// their app as the `@hermes/shared` package. A `shared/…` argument reads from
// there and lands in `donor/hermes-shared/…`, which our alias points at.
function locate(rel) {
  if (rel.startsWith("shared/")) {
    const inner = rel.slice("shared/".length);
    return {
      from: path.join(DONOR_SRC_DIR, "..", "..", "shared", "src", inner),
      to: path.join(VENDOR_DIR, "hermes-shared", inner),
      source: `apps/shared/src/${inner}`
    };
  }
  return {
    from: path.join(DONOR_SRC_DIR, rel),
    to: path.join(VENDOR_DIR, rel),
    source: `apps/desktop/src/${rel}`
  };
}

function vendor(rel) {
  const { from, to, source } = locate(rel);
  if (!fs.existsSync(from)) throw new Error(`not in the donor tree: ${rel}`);

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, header(source) + fs.readFileSync(from, "utf8"));
  return path.relative(VENDOR_DIR, to).replace(/\\/g, "/");
}

const args = process.argv.slice(2);
const listIndex = args.indexOf("--list");
const targets =
  listIndex === -1
    ? args
    : fs
        .readFileSync(args[listIndex + 1], "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

if (targets.length === 0) {
  console.error("usage: node runtime/vendor-donor.mjs <path…> | --list <file>");
  process.exit(2);
}

const problems = checkDonorTree();
if (problems.length) {
  for (const problem of problems) console.error(`PROBLEM: ${problem}`);
  process.exit(1);
}

for (const rel of targets) console.log(`vendored ${vendor(rel)}`);
