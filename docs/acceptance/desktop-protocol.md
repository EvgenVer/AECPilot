# Desktop protocol (task 3F.12)

Some checklist positions are about what **Windows** shows around the app: a real
Explorer window, a real save dialog, a window above other programs, a toast. Playwright
sees only the app's pages, so these positions get two kinds of evidence:

1. **An OS-level check.** The test asks the operating system itself. It uses the
   window under a point (`WindowFromPoint`), window styles, Shell.Application for
   Explorer, and UI Automation for dialogs. It does not trust what the page draws.
2. **A screenshot of the whole screen** in the position's row of the report, so the
   owner sees the result instead of reading a description of the check.

The script is `apps/desktop/e2e/lib/desktop-shot.ps1`. The OS questions live in
`apps/desktop/e2e/lib/desktop-probe.ps1`.

## Positions

The numbers in TASKS 3F.12 were drafted before the checklist got its final numbering.
The positions actually covered are:

| Position | What the OS must show | Where | OS-level check |
|---|---|---|---|
| 3.6.1 | Explorer opens on the file's folder with the file selected | `desktop-protocol.spec.ts` | Shell.Application: folder + `SelectedItems()` |
| 9.3.1 | Dark theme reaches scrollbars and the window frame | `desktop-protocol.spec.ts` | `nativeTheme.shouldUseDarkColors` + root `color-scheme` |
| 26.2.1 / 26.2.2 | Native save dialog from the image lightbox, name `image.png` | `desktop-protocol.spec.ts` | UI Automation: `#32770` of the main process, field 1001 |
| 26.6.1 / 26.6.2 | Native save dialog for profile export, name `<profile>.tar.gz` | `desktop-protocol.spec.ts` | same |
| 12.1.1 / 12.4.1 | Quick entry above all windows; gone without a taskbar trace | `blocks-12-13-27-32-33-os.spec.ts` | foreground window, `WS_EX_TOOLWINDOW` |
| 27.2.1 / 27.3.1 | Toast in the corner; the main window rises | same | toast payload, window state |
| 33.2.1 / 33.2.2 / 33.3.1 / 33.5.1 | HUD strip above another program, click-through, follows the cursor | same | `WindowFromPoint`, `WS_EX_TRANSPARENT`, real cursor |

4.3.1 (Explorer from a source) calls the same `shell.showItemInFolder` as 3.6.1, so the
real window is proven once, on 3.6.1.

**A known limit.** 27.3.1 clicks the toast by emitting `click` on the Electron
`Notification` object. It does not click the pixels of the Windows toast: a click
through the Action Center needs computer use and a person's approval of it. The OS
half checks that the main window came up from the taskbar.

## How to run

The `desktop` Playwright project opens real windows on the person's screen. It is
therefore **not** part of the `pnpm e2e` gate. It runs in the acceptance run of task
3F.14, in the **same** Playwright invocation as the other projects, because
Playwright clears `test-results/` on every run. `corepack pnpm e2e:acceptance` does
exactly that. After it, run `corepack pnpm e2e:acceptance:report`.

The screen must be unlocked. On a locked screen every window is covered by the lock
screen. Every position then **skips with that reason**, and the report shows it as 🟡,
never as green. The positions of the OS spec behave the same way.

Each position cleans up after itself: its Explorer window is closed, and a dialog is
closed with **Cancel**. Nothing is saved to disk.

## Manual use (agent or person)

If a position has to be looked at by hand, record it into the same journal and it
lands in the report:

```
powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/e2e/lib/desktop-shot.ps1 -Action shot -Position 27.3.1 -Verdict note -Note "clicked the real toast"
```

`explorer` and `dialog -Pid2 <main pid>` print what is open without changing it.
