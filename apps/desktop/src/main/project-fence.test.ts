// Task T71 (owner's remarks 3 and 7 on 0.1.0): the preview and the right-panel
// file tree refused a file INSIDE the project — «Следить можно только за файлом
// внутри проекта…».
//
// Cause: those fences compared the file's REAL path (after `realpath`) with the
// project path AS WRITTEN. When the project folder is reached through a
// junction, a symlink, a substituted drive or an 8.3 short name, the two never
// match, and every file of the project looked foreign. The vault window
// (`vault-fs.ts`) compared real with real and kept working — which is exactly
// what the owner saw: the documents opened, the preview and the tree did not.

import fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { projectFenceRoots } from './project-fence'
import { decideWatch, realPathAllowed } from './preview-watch-pure'
import { realPathWritable } from './preview-write-pure'

const nothingPicked = (): boolean => false

let base: string
let realProject: string
let linkedProject: string
let realFile: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'aec-t71-'))
  realProject = join(base, 'real', 'ЮП')
  fs.mkdirSync(join(realProject, 'workspace', 'tasks', 'notes'), { recursive: true })
  fs.writeFileSync(join(realProject, 'workspace', 'tasks', 'notes', 'T-003.docx'), 'x')
  // A junction needs no administrator rights on Windows; elsewhere a dir link.
  linkedProject = join(base, 'ЮП-link')
  fs.symlinkSync(realProject, linkedProject, 'junction')
  realFile = fs.realpathSync(join(linkedProject, 'workspace', 'tasks', 'notes', 'T-003.docx'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('the project fence after realpath (T71)', () => {
  it('a project opened through a junction: its own file is inside', () => {
    const asked = join(linkedProject, 'workspace', 'tasks', 'notes', 'T-003.docx')
    const roots = projectFenceRoots(linkedProject)

    expect(decideWatch(roots, asked, nothingPicked)).toEqual({ ok: true, absPath: asked })
    expect(realPathAllowed(roots, realFile, nothingPicked)).toBe(true)
    expect(realPathWritable(roots, realFile, nothingPicked)).toBe(true)
  })

  it('the agent names the file by its real path — inside as well', () => {
    const roots = projectFenceRoots(linkedProject)

    expect(decideWatch(roots, realFile, nothingPicked)).toMatchObject({ ok: true })
  })

  it('a link inside the project leading out stays refused', () => {
    const outside = join(base, 'чужое')
    fs.mkdirSync(outside)
    fs.writeFileSync(join(outside, 'секрет.html'), 'x')
    fs.symlinkSync(outside, join(realProject, 'escape'), 'junction')
    const roots = projectFenceRoots(linkedProject)

    const escaped = fs.realpathSync(join(linkedProject, 'escape', 'секрет.html'))
    expect(realPathAllowed(roots, escaped, nothingPicked)).toBe(false)
  })

  it('no project — no roots, and nothing is inside', () => {
    expect(projectFenceRoots(undefined)).toEqual([])
    expect(realPathAllowed([], realFile, nothingPicked)).toBe(false)
  })

  it('a project folder that is gone still fences by its written path', () => {
    const gone = join(base, 'нет-такой')
    expect(projectFenceRoots(gone)).toEqual([gone])
  })
})
