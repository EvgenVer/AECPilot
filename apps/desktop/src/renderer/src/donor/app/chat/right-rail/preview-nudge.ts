/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/right-rail/preview-nudge.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [4] inlined the WatchStage type — its module `lib/preview-act` is HX17
 * (no other edits)
 */
/**
 * OVERLAY NUDGE — the one way to say a stage to an overlay that is ALREADY on
 * the page.
 *
 * The act pipeline (preview-act.ts) injects the whole engine because it has to:
 * it needs to resolve a ref, measure a node and read the page back. The stages
 * that only narrate — the idle pulse, the read wipe — need none of that. They
 * are one function call against something the last action already left on the
 * page, so re-shipping the engine to make it would put the payload on the wire
 * on every turn boundary.
 *
 * A page the agent has never acted on has no overlay, and the nudge is a no-op
 * there. That is the right answer rather than a gap: chrome on a page the agent
 * never touched would be a lie about what it did.
 */

import { activePreviewScriptRunner } from './preview-script-runner'

// EDIT [4]: the WatchStage type is inlined instead of imported. Its module,
// `lib/preview-act`, is the agent pressing inside the preview page — SPEC HX17 —
// and is not vendored. Copied verbatim from their watch-in-page.ts at DONOR_SHA.
type WatchStage =
  | 'aim'
  | 'clear'
  | 'hold'
  | 'pin'
  | 'read'
  | 'rest'
  | 'strike'
  | 'strobe'
  | 'sweep'
  | 'think'
  | 'unpin'

/** Run one stage against the active pane's overlay, if it has one. */
export function nudgeOverlay(stage: WatchStage): void {
  const run = activePreviewScriptRunner()

  if (!run) {
    return
  }

  void run(`(function () {
  var w = window;
  var fn = w.__hermesWatch_fn;
  if (!fn) { return 'cold'; }
  try { fn(document, w.__hermesActHolder || {}, ${JSON.stringify(stage)}); } catch (err) {}
  return 'ok';
})()`).catch(() => {
    // The page navigated out from under us. The next action re-injects.
  })
}
