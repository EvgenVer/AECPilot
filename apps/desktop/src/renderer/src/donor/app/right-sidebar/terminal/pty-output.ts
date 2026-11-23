/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/right-sidebar/terminal/pty-output.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Line discipline for xterm instances fed by a real PTY.
//
// A PTY already emits CR LF where the program meant a new line, so the terminal
// must honour a bare LF as VT does: move down, KEEP the column. `convertEol`
// turns every LF into CR LF, which breaks cursor-addressed redraws — a full-screen TUI
// positions at column 3 (`CSI row;3H`), clears, then sends a bare LF to start
// the next indented row; with the conversion that row lands at column 1 and
// the old frame's first two glyphs survive as ghosts (`Th`, `Wh`) after a
// scroll repaint. Only pipe-backed streams may convert; the agent tab still
// converts for every process, including `pty=true` ones (#122482).
export const PTY_TERMINAL_LINE_OPTIONS = { convertEol: false } as const
