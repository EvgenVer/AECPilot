// Resolves the donor snapshot point used by the Phase 1.8 migration: which
// commit of hermes-agent we copy renderer code from, and where that tree lives
// on disk. Pure path/constant module — no side effects.
//
// See PLAN.md § "Слой донора — как именно берётся их код".

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { HERMES_SHA, HERMES_SRC_DIR } from "./hermes-env.mjs";

// The donor desktop lives in the same repository as the core, so the snapshot
// point is the core pin: components ported from it are written against exactly
// the gateway contract the installed core exposes. Keeping the two apart would
// let the UI and the core drift, which is the failure mode this pin exists to
// prevent.
export const DONOR_SHA = HERMES_SHA;
export const DONOR_TAG = "v2026.8.18";

// `apps/desktop/package.json` version at DONOR_SHA. Upstream stopped bumping it
// with the core release train (the core is 0.20.4), so it is recorded as the
// literal value found in the tree and is NOT a second pin — DONOR_SHA is. It
// still read "0.17.0" across the whole 0.20.0 → 0.20.4 window, checked at each
// tag by task 3.B0 — so an unchanged value here is evidence, not neglect.
export const DONOR_DESKTOP_VERSION = "0.17.0";

// Read source. Task 1.8.3 originally called for holding a separate clone at
// `D:\my program\Hermes\hermes-agent` on this commit; that clone is outside the
// workspace and the core install already checks the same repository out at
// exactly DONOR_SHA (runtime/.hermes-src, detached, gitignored). So we read from
// the in-workspace tree and leave the external clone untouched.
export const DONOR_ROOT = HERMES_SRC_DIR;
export const DONOR_DESKTOP_DIR = path.join(DONOR_ROOT, "apps", "desktop");
export const DONOR_SRC_DIR = path.join(DONOR_DESKTOP_DIR, "src");
export const DONOR_LICENSE_FILE = path.join(DONOR_ROOT, "LICENSE");

/**
 * Verifies the on-disk donor tree is the one this module claims. Returns a list
 * of problems; empty means the snapshot point is intact.
 */
export function checkDonorTree() {
  const problems = [];

  if (!fs.existsSync(DONOR_DESKTOP_DIR)) {
    problems.push(`donor desktop tree missing: ${DONOR_DESKTOP_DIR} (run runtime/setup.mjs)`);
    return problems;
  }

  const head = path.join(DONOR_ROOT, ".git", "HEAD");
  const headSha = fs.existsSync(head) ? fs.readFileSync(head, "utf8").trim() : "";
  if (headSha !== DONOR_SHA) {
    problems.push(`donor tree is at ${headSha || "<unknown>"}, expected ${DONOR_SHA}`);
  }

  const pkgFile = path.join(DONOR_DESKTOP_DIR, "package.json");
  const version = JSON.parse(fs.readFileSync(pkgFile, "utf8")).version;
  if (version !== DONOR_DESKTOP_VERSION) {
    problems.push(`donor desktop version is ${version}, expected ${DONOR_DESKTOP_VERSION}`);
  }

  if (!fs.existsSync(DONOR_LICENSE_FILE)) {
    problems.push(`donor LICENSE missing: ${DONOR_LICENSE_FILE}`);
  }

  return problems;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  console.log(`DONOR_SHA=${DONOR_SHA}`);
  console.log(`DONOR_TAG=${DONOR_TAG}`);
  console.log(`DONOR_DESKTOP_VERSION=${DONOR_DESKTOP_VERSION}`);
  console.log(`DONOR_DESKTOP_DIR=${DONOR_DESKTOP_DIR}`);
  const problems = checkDonorTree();
  for (const p of problems) console.error(`PROBLEM: ${p}`);
  process.exitCode = problems.length ? 1 : 0;
}
