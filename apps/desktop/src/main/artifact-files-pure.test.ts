import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { imageMime, isInside, isPreviewableImage, resolveArtifactPath } from './artifact-files-pure'

const ROOT = resolve('D:/proj/vault')

describe('resolveArtifactPath', () => {
  it('keeps an absolute path and reports it inside the project', () => {
    const result = resolveArtifactPath(ROOT, 'D:/proj/vault/out/plan.md')
    expect(result).toEqual({ ok: true, absPath: resolve(ROOT, 'out/plan.md'), insideProject: true })
  })

  it('resolves a relative path against the project root — the agent cwd IS the vault', () => {
    const result = resolveArtifactPath(ROOT, 'out/report.pdf')
    expect(result).toMatchObject({ ok: true, absPath: resolve(ROOT, 'out/report.pdf') })
  })

  it('marks a path outside the project without refusing to resolve it', () => {
    // Revealing it in the explorer is still legitimate; only the preview cares.
    expect(resolveArtifactPath(ROOT, 'D:/other/secret.md')).toMatchObject({
      ok: true,
      insideProject: false
    })
  })

  it('sees through traversal in a relative path', () => {
    expect(resolveArtifactPath(ROOT, '../../windows/system32/drivers/etc/hosts')).toMatchObject({
      insideProject: false
    })
  })

  it('unwraps a file:// url, drive letter and unc alike', () => {
    expect(resolveArtifactPath(ROOT, 'file:///D:/proj/vault/out/plan.md')).toMatchObject({
      absPath: resolve(ROOT, 'out/plan.md')
    })
    expect(resolveArtifactPath(ROOT, 'file://nas/share/scan.pdf')).toMatchObject({
      ok: true,
      insideProject: false
    })
  })

  it('decodes percent-escapes in a file:// url', () => {
    expect(resolveArtifactPath(ROOT, 'file:///D:/proj/vault/my%20plan.md')).toMatchObject({
      absPath: resolve(ROOT, 'my plan.md')
    })
  })

  // A link goes through `decideExternalLink`; letting it into the file path
  // would be the start of a scheme-confusion bug.
  it('refuses anything that is a scheme, not a path', () => {
    expect(resolveArtifactPath(ROOT, 'https://example.com/a.pdf')).toMatchObject({ ok: false })
    expect(resolveArtifactPath(ROOT, 'data:image/png;base64,AAAA')).toMatchObject({ ok: false })
    expect(resolveArtifactPath(ROOT, 'javascript:alert(1)')).toMatchObject({ ok: false })
  })

  it('refuses an empty value and one with control characters', () => {
    expect(resolveArtifactPath(ROOT, '   ')).toMatchObject({ ok: false })
    expect(resolveArtifactPath(ROOT, 'out/pl\u0000an.md')).toMatchObject({ ok: false })
  })

  it('refuses a relative path when no project is open', () => {
    expect(resolveArtifactPath(undefined, 'out/plan.md')).toMatchObject({ ok: false })
  })
})

describe('isInside', () => {
  it('accepts the root itself and anything below it', () => {
    expect(isInside(ROOT, ROOT)).toBe(true)
    expect(isInside(ROOT, resolve(ROOT, 'a/b.md'))).toBe(true)
  })

  it('rejects a sibling whose name merely starts the same', () => {
    expect(isInside(ROOT, resolve('D:/proj/vault-backup/a.md'))).toBe(false)
  })

  it('is false with no project open', () => {
    expect(isInside(undefined, resolve(ROOT, 'a.md'))).toBe(false)
  })
})

describe('isPreviewableImage', () => {
  it('accepts raster formats', () => {
    expect(isPreviewableImage('D:/a/plan.PNG')).toBe(true)
    expect(isPreviewableImage('D:/a/photo.jpeg')).toBe(true)
  })

  // SVG is markup with script capability. It counts as an image in the list
  // and is still not decoded into the window.
  it('rejects svg and non-images', () => {
    expect(isPreviewableImage('D:/a/scheme.svg')).toBe(false)
    expect(isPreviewableImage('D:/a/report.pdf')).toBe(false)
  })
})

describe('imageMime', () => {
  it('maps the extension, falling back to a byte stream', () => {
    expect(imageMime('a.jpg')).toBe('image/jpeg')
    expect(imageMime('a.webp')).toBe('image/webp')
    expect(imageMime('a.unknown')).toBe('application/octet-stream')
  })
})
