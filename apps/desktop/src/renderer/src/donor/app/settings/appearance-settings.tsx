/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/appearance-settings.tsx
 * Commit:  345cd2b057a452236de401d3534b8502a7465e8d (v2026.9.14)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] removed the pet settings section (HX1)
 *   [3] dropped the window-translucency row and the VS Code Marketplace theme
 *       search/import (both HX14) — with their imports, derived state and the
 *       search box's second job. Since v2026.9.14 the search placeholder is an
 *       i18n key; its Marketplace half is dropped by our catalogs' OVERRIDES
 *       (`shared/i18n/en.ts`, `ru.ts`), not here
 * (no other edits)
 */

import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useDebounced } from '@/app/hooks/use-debounced'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Check, Download, Loader2, Palette, Trash2 } from '@/lib/icons'
import { selectableCardClass } from '@/lib/selectable-card'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import { $backdrop, setBackdrop } from '@/store/backdrop'
import { $composerPopoutGesturesEnabled, setComposerPopoutGesturesEnabled } from '@/store/composer-popout'
import { $embedAllowed, $embedMode, clearEmbedAllowed, type EmbedMode, setEmbedMode } from '@/store/embed-consent'
import { $introSplash, setIntroSplash } from '@/store/intro-splash'
import { notifyError } from '@/store/notifications'
import { $activeGatewayProfile, $profiles, normalizeProfileKey } from '@/store/profile'
import { $reactionsEnabled, setReactionsEnabled } from '@/store/reactions-enabled'
import { $reasoningCollapsedByDefault, setReasoningCollapsedByDefault } from '@/store/reasoning-disclosure'
import { $sessionListDensity, type SessionListDensity, setSessionListDensity } from '@/store/session-list-density'
import { $tabStripDefault, setTabStripDefault, type TabStripDefault } from '@/store/tabstrip-prefs'
import { $spentTipCount, $tipsEnabled, resetTips, setTipsEnabled } from '@/store/tips'
import {
  $titlebarAppActionsSide,
  setTitlebarAppActionsSide,
  type TitlebarAppActionsSide
} from '@/store/titlebar-app-actions'
import { $toolViewMode, setToolViewMode } from '@/store/tool-view'
import { $toursEnabled, setToursEnabled } from '@/store/tours'
import {
  beginTranslucencyPeek,
  endTranslucencyPeek,
  pulseTranslucencyPeek,
  TRANSLUCENCY_MAX,
  TRANSLUCENCY_MIN,
  TRANSLUCENCY_STEP
} from '@/store/translucency'
import { $userBubbleTransparency, setUserBubbleTransparency } from '@/store/user-bubble-transparency'
import { $vibeHeartsEnabled, setVibeHeartsEnabled } from '@/store/vibe-hearts-enabled'
import { $zoomPercent, setZoomPercent } from '@/store/zoom'
import { getBaseColors, useTheme } from '@/themes/context'
import type { DesktopTheme } from '@/themes/types'
import { isUserTheme, removeUserTheme } from '@/themes/user-themes'

import { setHermesConfigCache, useHermesConfigRecord } from '../hooks/use-config-record'

import { MODE_OPTIONS } from './constants'
import { setNested } from './helpers'
import { ListRow, SectionHeading, SettingsContent, ToggleRow } from './primitives'
import { APPEARANCE_SETTING_IDS } from './settings-search'
import { TerminalFontSetting } from './terminal-font-setting'
import { useDeepLinkHighlight } from './use-deep-link-highlight'

// display.resume_last_session lives in the backend config record (shared with
// config.yaml and the cold-start restore in use-desktop-integrations), not a
// renderer store. Saves write through the shared react-query cache so the
// restore gate sees the new value on the next launch.
function ResumeLastSessionSetting() {
  const { t } = useI18n()
  const a = t.settings.appearance
  const configQuery = useHermesConfigRecord()
  const config = configQuery.data
  const checked = (config?.display as { resume_last_session?: unknown } | undefined)?.resume_last_session !== false

  const update = (on: boolean) => {
    if (!config) {
      return
    }

    const next = setNested(config, 'display.resume_last_session', on)
    setHermesConfigCache(next)
    // Sparse patch: PUT /api/config deep-merges, and echoing the cached
    // snapshot would overwrite keys other surfaces changed since it loaded.
    void saveHermesConfig(setNested({}, 'display.resume_last_session', on))
      .then(result => {
        if (!result.ok) {
          throw new Error(t.settings.config.autosaveFailed)
        }
      })
      .catch(error => {
        setHermesConfigCache(config)
        notifyError(error, t.settings.config.autosaveFailed)
      })
  }

  return (
    <ToggleRow
      checked={checked}
      description={a.resumeLastSessionDesc}
      disabled={!config}
      label={a.resumeLastSessionTitle}
      onChange={update}
    />
  )
}

function ThemePreview({ name, mode }: { name: string; mode: 'light' | 'dark' }) {
  // Preview in the *current* mode: the dark palette in Dark, and the light
  // palette in Light — synthesizing one for dark-only themes — so every card
  // tracks the Light/Dark toggle, exactly like the app itself does.
  const c = getBaseColors(name, mode)

  return (
    <div
      className="h-20 overflow-hidden rounded-xl border shadow-xs"
      style={{ backgroundColor: c.background, borderColor: c.border }}
    >
      <div className="flex h-full">
        <div
          className="w-12 border-r"
          style={{
            backgroundColor: c.sidebarBackground ?? c.muted,
            borderColor: c.sidebarBorder ?? c.border
          }}
        />
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="h-2.5 w-16 rounded-full" style={{ backgroundColor: c.foreground }} />
          <div className="h-2 w-24 rounded-full" style={{ backgroundColor: c.mutedForeground }} />
          <div className="mt-auto flex justify-end">
            <div
              className="h-5 w-16 rounded-full border"
              style={{
                backgroundColor: c.userBubble ?? c.muted,
                borderColor: c.userBubbleBorder ?? c.border
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// UI scale presets, as zoom percentages. 100 is Chromium's actual-size
// baseline; the shipped default is the 90% preset. Ids double as the percent
// values sent to the main process. A Cmd/Ctrl +/- step landing between
// presets highlights nothing, and the row description keeps showing the
// exact current percent.
const UI_SCALE_PRESETS = ['90', '100', '110', '125', '150', '175'] as const
const APPEARANCE_SEARCH_TARGETS = new Set<string>(Object.values(APPEARANCE_SETTING_IDS))
const appearanceSettingElementId = (id: string) => `setting-field-${id}`

type UiScalePreset = (typeof UI_SCALE_PRESETS)[number]

function matchUiScalePreset(percent: number): UiScalePreset | null {
  return UI_SCALE_PRESETS.find(preset => Number(preset) === percent) ?? null
}

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

// EDIT [3]: `GlassRow` is gone with the window-translucency row it served
// (HX14). `TranslucencySlider` stays: since 0.21.2 it also drives the
// user-bubble transparency row below, which is not HX14.
const SLIDER_STEP_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp'
])

interface TranslucencySliderProps {
  label: string
  onChange: (value: number) => void
  value: number
}

/**
 * One 0–100 lever, used up to twice: Clear's window opacity, and under Glass
 * the tint plus an optional native fade.
 *
 * Peek while the hand is on it — the overlay (scrim + near-opaque card) ghosts
 * so the window behind IS the live preview. The pointer pair covers
 * mouse/touch drags; the keyboard path pulses per step instead, and blur ends
 * any residual hold.
 */
function TranslucencySlider({ label, onChange, value }: TranslucencySliderProps) {
  return (
    <>
      <input
        aria-label={label}
        className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary)"
        max={TRANSLUCENCY_MAX}
        min={TRANSLUCENCY_MIN}
        onBlur={endTranslucencyPeek}
        onChange={event => {
          triggerHaptic('selection')
          onChange(Number(event.target.value))
        }}
        onKeyDown={event => {
          if (SLIDER_STEP_KEYS.has(event.key)) {
            pulseTranslucencyPeek()
          }
        }}
        onLostPointerCapture={endTranslucencyPeek}
        onPointerDown={beginTranslucencyPeek}
        onPointerUp={endTranslucencyPeek}
        step={TRANSLUCENCY_STEP}
        style={{ accentColor: 'var(--dt-primary)' }}
        type="range"
        value={value}
      />
      <span className="w-9 text-right text-[length:var(--conversation-caption-font-size)] tabular-nums text-(--ui-text-tertiary)">
        {value}%
      </span>
    </>
  )
}

export function AppearanceSettings() {
  const { t, isSavingLocale } = useI18n()
  const { themeName, mode, resolvedMode, availableThemes, setTheme, setMode } = useTheme()
  const toolViewMode = useStore($toolViewMode)
  const reasoningCollapsedByDefault = useStore($reasoningCollapsedByDefault)
  const sessionListDensity = useStore($sessionListDensity)
  const tabStripDefault = useStore($tabStripDefault)
  const titlebarAppActionsSide = useStore($titlebarAppActionsSide)
  const zoomPercent = useStore($zoomPercent)
  const embedMode = useStore($embedMode)
  const embedAllowed = useStore($embedAllowed)
  const composerPopoutGesturesEnabled = useStore($composerPopoutGesturesEnabled)
  const userBubbleTransparency = useStore($userBubbleTransparency)
  const reactionsEnabled = useStore($reactionsEnabled)
  const tipsEnabled = useStore($tipsEnabled)
  const toursEnabled = useStore($toursEnabled)
  const spentTips = useStore($spentTipCount)
  const vibeHeartsEnabled = useStore($vibeHeartsEnabled)
  const backdrop = useStore($backdrop)
  const introSplash = useStore($introSplash)
  const profiles = useStore($profiles)
  const activeProfileKey = normalizeProfileKey(useStore($activeGatewayProfile))
  const a = t.settings.appearance

  const [query, setQuery] = useState('')

  useDeepLinkHighlight({
    elementId: appearanceSettingElementId,
    param: 'setting',
    ready: id => APPEARANCE_SEARCH_TARGETS.has(id)
  })

  // EDIT [3]: one box, one job now — filter installed themes. Its second job
  // (a live VS Code Marketplace search) is HX14 and is gone with that block.
  const needle = normalize(query)

  const filteredThemes = availableThemes
    .filter(
      theme =>
        !needle ||
        theme.label.toLowerCase().includes(needle) ||
        theme.name.toLowerCase().includes(needle) ||
        theme.description.toLowerCase().includes(needle)
    )
    // Active theme first; stable sort keeps the rest in their original order.
    .sort((a, b) => Number(b.name === themeName) - Number(a.name === themeName))

  // Themes save per profile. Surface that only when the user actually has more
  // than one profile (single-profile installs never see the distinction).
  const showProfileNote = profiles.length > 1

  const activeProfileName =
    profiles.find(profile => normalizeProfileKey(profile.name) === activeProfileKey)?.name ?? activeProfileKey

  const modeOptions = MODE_OPTIONS.map(({ id, icon }) => ({ icon, id, label: t.settings.modeOptions[id].label }))

  const toolOptions = [
    { id: 'product', label: a.product },
    { id: 'technical', label: a.technical }
  ] as const

  const sessionDensityOptions = [
    { id: 'compact', label: a.sessionDensityCompact },
    { id: 'comfortable', label: a.sessionDensityComfortable },
    { id: 'detailed', label: a.sessionDensityDetailed }
  ] as const satisfies readonly { id: SessionListDensity; label: string }[]

  const tabStripOptions = [
    { id: 'auto', label: a.tabStripAuto },
    { id: 'always', label: a.tabStripAlways },
    { id: 'never', label: a.tabStripNever }
  ] as const satisfies readonly { id: TabStripDefault; label: string }[]

  const appActionsOptions = [
    { id: 'right', label: a.appActionsRight },
    { id: 'left', label: a.appActionsLeft }
  ] as const satisfies readonly { id: TitlebarAppActionsSide; label: string }[]

  const embedOptions = [
    { id: 'ask', label: a.embedsAsk },
    { id: 'always', label: a.embedsAlways },
    { id: 'off', label: a.embedsOff }
  ] as const satisfies readonly { id: EmbedMode; label: string }[]

  const uiScaleOptions = UI_SCALE_PRESETS.map(preset => ({ id: preset, label: `${preset}%` }))

  const matchedScalePreset = matchUiScalePreset(zoomPercent)

  return (
    <SettingsContent>
      <div>
        <SectionHeading icon={Palette} title={a.title} />
        <p className="max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {a.intro}
        </p>

        <div className="mt-2">
          <ListRow
            action={<LanguageSwitcher />}
            description={isSavingLocale ? t.language.saving : t.language.description}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.language)}
            title={t.language.label}
          />

          <ListRow
            below={
              <>
                {/* EDIT [3]: the box filters installed themes. Its second job —
                    a live VS Code Marketplace search — is HX14. */}
                <div className="mt-3">
                  <input
                    className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-1.5 text-[length:var(--conversation-caption-font-size)] outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--ui-stroke-secondary)"
                    onChange={event => setQuery(event.target.value)}
                    placeholder={a.themeSearchPlaceholder}
                    spellCheck={false}
                    value={query}
                  />
                </div>

                {/* Fixed-height scroll area so the (growing) theme list never
                    runs the page long; the grid scrolls inside it. */}
                <div className="mt-3 max-h-96 overflow-y-auto pr-1">
                  {filteredThemes.length === 0 ? (
                    needle ? (
                      <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                        No installed themes match "{query.trim()}".
                      </p>
                    ) : null
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredThemes.map(theme => {
                        const active = themeName === theme.name
                        const removable = isUserTheme(theme.name)

                        return (
                          <div className="group relative" key={theme.name}>
                            <button
                              className={cn('w-full p-2 text-left', selectableCardClass({ active, prominent: true }))}
                              onClick={() => {
                                triggerHaptic('crisp')
                                setTheme(theme.name)
                              }}
                              type="button"
                            >
                              <ThemePreview mode={resolvedMode} name={theme.name} />
                              <div className="mt-3 px-1">
                                <div className="truncate text-[length:var(--conversation-text-font-size)] font-medium">
                                  {theme.label}
                                </div>
                                <div className="mt-0.5 line-clamp-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                                  {theme.description}
                                </div>
                              </div>
                            </button>
                            {removable && (
                              <button
                                aria-label={a.removeTheme}
                                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-(--ui-bg-elevated)/80 text-(--ui-text-tertiary) opacity-0 backdrop-blur-sm transition hover:text-(--ui-red) focus-visible:opacity-100 group-hover:opacity-100"
                                onClick={() => {
                                  triggerHaptic('crisp')
                                  removeUserTheme(theme.name)

                                  // Re-normalize off the now-missing skin → default.
                                  if (active) {
                                    setTheme(theme.name)
                                  }
                                }}
                                title={a.removeTheme}
                                type="button"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {showProfileNote && (
                  <p className="mt-3 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                    {a.themeProfileNote(activeProfileName)}
                  </p>
                )}
              </>
            }
            description={a.themeDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.theme)}
            title={
              <div className="flex items-center justify-between gap-3">
                <span>{a.themeTitle}</span>
                <SegmentedControl
                  onChange={id => {
                    triggerHaptic('crisp')
                    setMode(id)
                  }}
                  options={modeOptions}
                  value={mode}
                />
              </div>
            }
            wide
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setZoomPercent(Number(id))
                }}
                options={uiScaleOptions}
                value={matchedScalePreset ?? ('' as UiScalePreset)}
              />
            }
            description={a.uiScaleDesc(zoomPercent)}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.uiScale)}
            title={a.uiScaleTitle}
          />

          <TerminalFontSetting />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setSessionListDensity(id)
                }}
                options={sessionDensityOptions}
                value={sessionListDensity}
              />
            }
            description={a.sessionDensityDesc}
            title={a.sessionDensityTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setTabStripDefault(id)
                }}
                options={tabStripOptions}
                value={tabStripDefault}
              />
            }
            description={a.tabStripDesc}
            title={a.tabStripTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setTitlebarAppActionsSide(id)
                }}
                options={appActionsOptions}
                value={titlebarAppActionsSide}
              />
            }
            description={a.appActionsDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.appActions)}
            title={a.appActionsTitle}
          />

          {/* EDIT [3]: the window-translucency row is removed — HX14. */}

          <ListRow
            action={
              // Same peek as the window lever: the bubble being tuned sits
              // behind this overlay, so the overlay ghosts while the hand is
              // on the slider.
              <div className="flex items-center gap-3" data-translucency-peek-scope="">
                <TranslucencySlider
                  label={a.userBubbleTitle}
                  onChange={setUserBubbleTransparency}
                  value={userBubbleTransparency}
                />
              </div>
            }
            description={a.userBubbleDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.userBubble)}
            title={a.userBubbleTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setBackdrop(id === 'on')
                }}
                options={[
                  { id: 'off', label: t.common.off },
                  { id: 'on', label: t.common.on }
                ]}
                value={backdrop ? 'on' : 'off'}
              />
            }
            description={a.backdropDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.backdrop)}
            title={a.backdropTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setIntroSplash(id === 'on')
                }}
                options={[
                  { id: 'off', label: t.common.off },
                  { id: 'on', label: t.common.on }
                ]}
                value={introSplash ? 'on' : 'off'}
              />
            }
            description={a.introSplashDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.introSplash)}
            title={a.introSplashTitle}
          />

          <ToggleRow
            checked={composerPopoutGesturesEnabled}
            description={a.composerPopoutDesc}
            label={a.composerPopoutTitle}
            onChange={setComposerPopoutGesturesEnabled}
          />

          <ResumeLastSessionSetting />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setReactionsEnabled(id === 'on')
                }}
                options={[
                  { id: 'off', label: t.common.off },
                  { id: 'on', label: t.common.on }
                ]}
                value={reactionsEnabled ? 'on' : 'off'}
              />
            }
            description={a.reactionsDesc}
            title={a.reactionsTitle}
          />

          <ListRow
            action={
              <div className="flex flex-col items-end gap-1.5">
                <SegmentedControl
                  onChange={id => {
                    triggerHaptic('selection')
                    setTipsEnabled(id === 'on')
                  }}
                  options={[
                    { id: 'off', label: t.common.off },
                    { id: 'on', label: t.common.on }
                  ]}
                  value={tipsEnabled ? 'on' : 'off'}
                />
                {/* A tip shows once (✕ or timer), so this is the only way to a
                    second lap. It appears once there is something to bring back. */}
                {spentTips > 0 && (
                  <Button
                    onClick={() => {
                      triggerHaptic('selection')
                      resetTips()
                    }}
                    size="inline"
                    variant="text"
                  >
                    {a.tipsReset(spentTips)}
                  </Button>
                )}
              </div>
            }
            description={a.tipsDesc}
            title={a.tipsTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setToursEnabled(id === 'on')
                }}
                options={[
                  { id: 'off', label: t.common.off },
                  { id: 'on', label: t.common.on }
                ]}
                value={toursEnabled ? 'on' : 'off'}
              />
            }
            description={a.toursDesc}
            title={a.toursTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setVibeHeartsEnabled(id === 'on')
                }}
                options={[
                  { id: 'off', label: t.common.off },
                  { id: 'on', label: t.common.on }
                ]}
                value={vibeHeartsEnabled ? 'on' : 'off'}
              />
            }
            description={a.vibeHeartsDesc}
            title={a.vibeHeartsTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setToolViewMode(id)
                }}
                options={toolOptions}
                value={toolViewMode}
              />
            }
            description={a.toolViewDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.toolView)}
            title={a.toolViewTitle}
          />

          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setReasoningCollapsedByDefault(id === 'on')
                }}
                options={[
                  { id: 'off', label: t.common.off },
                  { id: 'on', label: t.common.on }
                ]}
                value={reasoningCollapsedByDefault ? 'on' : 'off'}
              />
            }
            description={a.reasoningCollapsedDesc}
            title={a.reasoningCollapsedTitle}
          />

          <ListRow
            action={
              <div className="flex flex-col items-end gap-1.5">
                <SegmentedControl
                  onChange={id => {
                    triggerHaptic('selection')
                    setEmbedMode(id)
                  }}
                  options={embedOptions}
                  value={embedMode}
                />
                {embedAllowed.length > 0 && (
                  <Button
                    onClick={() => {
                      triggerHaptic('selection')
                      clearEmbedAllowed()
                    }}
                    size="inline"
                    variant="text"
                  >
                    {a.embedsReset(embedAllowed.length)}
                  </Button>
                )}
              </div>
            }
            description={a.embedsDesc}
            id={appearanceSettingElementId(APPEARANCE_SETTING_IDS.embeds)}
            title={a.embedsTitle}
          />
        </div>
      </div>

      <div className="mt-6">
        {/* EDIT [3]: the pet settings section is HX1. */}
      </div>
    </SettingsContent>
  )
}
