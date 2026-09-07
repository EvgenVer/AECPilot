/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/tour/index.ts
 * Commit:  29112bef099274229cadff79cdff7bf7b99c4b77 (v2026.8.31)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * TOURS — highlight-and-narrate walkthroughs for any surface.
 *
 * Two consumers, one engine:
 *
 * - The `tour` agent tool, via the gateway (see run-tour.ts).
 * - Your own curated tours, via this module:
 *
 * ```ts
 * import { startTour, showTourStep, stopTour } from '@/lib/tour'
 *
 * startTour([
 *   { selector: '[data-tour="composer"]', title: 'Composer', text: 'Type here.' },
 *   { selector: '[data-tour="files"]', title: 'Files', text: 'Your project.' }
 * ])
 * ```
 *
 * Tours run against whatever is in the DOM — mark elements with `data-tour="…"`
 * to give them durable handles (see `collectTourTargets`, which reports those
 * first and flags every selector as stable or positional).
 */

export { collectTourTargets, type TourTarget } from './collect-targets'
export type { TourAction, TourHost, TourResult, TourStep } from './engine'
export {
  isTourActive,
  listTourTargets,
  nextTourStep,
  previousTourStep,
  runTour,
  showTourStep,
  startTour,
  stopTour,
  type TourSurface
} from './run-tour'
