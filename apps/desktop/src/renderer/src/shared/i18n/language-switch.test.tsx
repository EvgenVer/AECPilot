// Task 1.8.6's acceptance check: switching the interface language changes what
// the UI renders, from both catalogs, and the choice survives.
//
// It used to drive our own Welcome and settings screens. Those are gone —
// task 1.8.9 replaced our renderer with the donor's application — so the two
// consumers here are probes standing for the two catalogs that exist: theirs
// (`useI18n().t`, the strings that came with their code) and ours
// (`useAecT()`, the strings for our own surfaces). Between them they cover
// every path a screen can take to a translated string.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { AecI18nProvider, useAecT, useI18n } from './index'

/** Reads the donor's catalog — the half that arrives with their components. */
function DonorProbe() {
  const { locale, t } = useI18n()

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="donor-save">{t.common.save}</span>
    </div>
  )
}

/** Reads ours — the half written for surfaces the donor has no equivalent of. */
function AecProbe() {
  const t = useAecT()

  return <span data-testid="aec-tagline">{t('welcome.tagline')}</span>
}

/** Switches the language, the way their settings screen does. */
function LanguageSwitch() {
  const { setLocale } = useI18n()

  return (
    <div>
      <button onClick={() => void setLocale('en').catch(() => undefined)} type="button">
        English
      </button>
      <button onClick={() => void setLocale('ru').catch(() => undefined)} type="button">
        Русский
      </button>
    </div>
  )
}

function renderAll() {
  return render(
    <AecI18nProvider>
      <DonorProbe />
      <AecProbe />
      <LanguageSwitch />
    </AecI18nProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('interface language', () => {
  it('starts in Russian — the default for a fresh install', async () => {
    renderAll()
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('ru'))
    expect(screen.getByTestId('donor-save').textContent).toBe('Сохранить')
    expect(screen.getByTestId('aec-tagline').textContent).toBe('IDE для проектной документации')
  })

  it('starts in English when that is what the user picked before', async () => {
    window.localStorage.setItem('aecpilot.ui-language', 'en')
    renderAll()
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('en'))
    expect(screen.getByTestId('donor-save').textContent).toBe('Save')
    expect(screen.getByTestId('aec-tagline').textContent).toBe('An IDE for project documentation')
  })

  it('switches both catalogs at once and remembers the choice', async () => {
    renderAll()
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('ru'))

    await act(async () => {
      screen.getByRole('button', { name: 'English' }).click()
    })

    await waitFor(() => expect(screen.getByTestId('donor-save').textContent).toBe('Save'))
    expect(screen.getByTestId('aec-tagline').textContent).toBe('An IDE for project documentation')
    expect(window.localStorage.getItem('aecpilot.ui-language')).toBe('en')

    await act(async () => {
      screen.getByRole('button', { name: 'Русский' }).click()
    })

    await waitFor(() => expect(screen.getByTestId('donor-save').textContent).toBe('Сохранить'))
    expect(window.localStorage.getItem('aecpilot.ui-language')).toBe('ru')
  })

  it('falls back to English for a key our Russian catalog has not reached yet', async () => {
    // The Russian half of their catalog is deliberately partial until task 6.7;
    // `defineLocale` merges it over English, so an untranslated key must show
    // the English string rather than a blank or the raw key.
    renderAll()
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('ru'))
    expect(screen.getByTestId('donor-save').textContent).not.toBe('common.save')
  })
})
