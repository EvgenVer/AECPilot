// Task 1.6.A4. The classification must agree with the gateway's own rules —
// an extension we accept but they reject produces error 4016 after the user
// has already chosen the file.

import { describe, expect, it } from 'vitest'
import {
  attachmentErrorMessage,
  attachmentLabel,
  attachmentSummary,
  classifyAttachment,
  IMAGE_DIALOG_EXTENSIONS
} from './attachments'

describe('classifyAttachment', () => {
  it('accepts exactly the image extensions their cli lists', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico']) {
      expect(classifyAttachment(`C:/pics/shot.${ext}`)).toBe('image')
    }
    expect(IMAGE_DIALOG_EXTENSIONS).toHaveLength(10)
  })

  it('is case-insensitive — Windows hands back .PNG', () => {
    expect(classifyAttachment('C:/pics/SHOT.PNG')).toBe('image')
  })

  it('routes a PDF to its own handler', () => {
    expect(classifyAttachment('D:/docs/спека.pdf')).toBe('pdf')
  })

  it('refuses what the gateway would refuse', () => {
    expect(classifyAttachment('notes.txt')).toBe('unsupported')
    expect(classifyAttachment('archive.zip')).toBe('unsupported')
    expect(classifyAttachment('README')).toBe('unsupported')
  })
})

describe('attachmentLabel', () => {
  it('shows the file name, not the whole path', () => {
    expect(attachmentLabel('C:\\Users\\Ivan\\Pictures\\план.png')).toBe('план.png')
    expect(attachmentLabel('/home/ivan/plan.png')).toBe('plan.png')
  })
})

describe('attachmentSummary', () => {
  it('counts in Russian', () => {
    expect(attachmentSummary(1)).toBe('1 вложение')
    expect(attachmentSummary(3)).toBe('3 вложения')
    expect(attachmentSummary(12)).toBe('12 вложений')
  })

  it('says nothing about nothing', () => {
    expect(attachmentSummary(0)).toBe('')
  })
})

describe('attachmentErrorMessage', () => {
  it('turns the missing-poppler failure into something actionable', () => {
    // On Windows this is the normal state of the machine, not a broken build.
    const message = attachmentErrorMessage(
      'pdftoppm not installed (poppler-utils package required)'
    )
    expect(message).toContain('poppler')
    expect(message).toContain('картинками')
  })

  it('translates the clipboard refusals', () => {
    expect(attachmentErrorMessage('No image found in clipboard')).toBe(
      'В буфере обмена нет картинки.'
    )
  })

  it('passes an unknown failure through rather than swallowing it', () => {
    expect(attachmentErrorMessage('image not found: foo.png')).toBe('image not found: foo.png')
  })
})
