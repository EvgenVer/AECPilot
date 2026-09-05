/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/avatar-picker.tsx
 * Commit:  29112bef099274229cadff79cdff7bf7b99c4b77 (v2026.8.31)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the Generate tab (portrait generation, HX11) — its state, its
 *       availability probe, its handler and its tab body
 *   [3] dropped the Pet tab (HX1) and the `./pet` import; neither `pet.tsx`
 *       nor its `pet.test.tsx` is vendored
 *   [4] dropped the imports orphaned by both removals
 * (no other edits)
 */
/**
 * The avatar editor shared by Edit Profile and New Bot: shape grid + color
 * swatches, the Generate and Upload tabs, and the petdex Pet tab.
 */

import {
  Button,
  cn,
  Codicon,
  ColorSwatches,
  PROFILE_SWATCHES,
  RowButton,
  SegmentedControl
} from '@hermes/plugin-sdk'
import { useState } from 'react'

import {
  AVATAR_PICKER_SHAPES,
  avatarColor,
  BLOB_KINDS,
  blobatarSvg,
  blobShapeString,
  BotFace,
  defaultShapeFor,
  isBlobShape,
  parseBlobShape
} from './avatar'
import {
  normalizeAvatarImage,
  pickImageFromDevice
} from './avatar-image'
import { useBots } from './i18n'

interface AvatarPickerProps {
  /** `null` = no explicit pick, i.e. the name's deterministic hue. */
  color: null | string
  /** Feeds the Generate tab when the user leaves the description blank. */
  generateSeed?: { description?: string; name?: string; title?: string } | null
  image: null | string
  onColor: (color: null | string) => void
  onImage: (image: null | string) => void
  onShape: (shape: string) => void
  shape: string
}

/** Shape grid + color swatches, shared by Edit Profile and New Bot. */
export function AvatarPicker({ shape, color, image, onShape, onColor, onImage, generateSeed }: AvatarPickerProps) {
  const b = useBots()
  const pickerName = generateSeed?.name || 'agent'
  const [tab, setTab] = useState('bot')
  const upload = async () => {
    const raw = await pickImageFromDevice()

    if (raw) {
      onImage(await normalizeAvatarImage(raw))
    }
  }

  return (
    <div className="grid justify-items-center gap-3">
      <SegmentedControl
        onChange={setTab}
        options={[
          { id: 'bot', label: b.avatar.tabBot },
          { id: 'upload', label: b.avatar.upload }
        ]}
        value={tab}
      />
      {image ? (
        <Button onClick={() => onImage(null)} size="sm" type="button" variant="ghost">
          {b.avatar.removeImage}
        </Button>
      ) : null}
      {tab === 'bot' ? (
        isBlobShape(shape) && blobatarSvg ? (
          (() => {
            const { seedPart, kind } = parseBlobShape(shape, pickerName)
            const locked = Boolean(seedPart)

            return (
              <div className="grid justify-items-center gap-3">
                {/* Silhouette pins: Auto (name decides) + the six blob kinds. */}
                <div className="grid grid-cols-4 justify-items-center gap-1.5">
                  {['', ...BLOB_KINDS].map(k => (
                    <RowButton
                      className={cn(
                        'flex items-center justify-center rounded-md transition-colors hover:bg-(--chrome-action-hover)',
                        k === kind && !image && 'ring-1 ring-(--ui-accent)'
                      )}
                      key={k || 'auto'}
                      onClick={() => {
                        onImage(null)
                        onShape(blobShapeString(seedPart, k))
                      }}
                      style={{
                        width: 44,
                        height: 44
                      }}
                      title={k || 'Auto — the name decides'}
                    >
                      {k ? (
                        <BotFace
                          color={avatarColor(color, pickerName)}
                          name={pickerName}
                          shape={blobShapeString(seedPart, k)}
                          size={32}
                        />
                      ) : (
                        <span className="text-[0.6rem] text-(--ui-text-tertiary)">Auto</span>
                      )}
                    </RowButton>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    onClick={() => {
                      onImage(null)
                      onShape(blobShapeString(Math.random().toString(36).slice(2, 10), kind))
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Codicon className="mr-1 text-[0.8rem]" name="refresh" />
                    {b.avatar.randomize}
                  </Button>
                  <Button
                    onClick={() => onShape(blobShapeString(locked ? '' : pickerName, kind))}
                    size="sm"
                    title={locked ? b.avatar.unlockFollowsName : 'Keep this exact face even if the name changes'}
                    type="button"
                    variant="ghost"
                  >
                    <Codicon className="mr-1 text-[0.8rem]" name={locked ? 'unlock' : 'lock'} />
                    {locked ? 'Unlock' : 'Lock face'}
                  </Button>
                </div>
                <div className="text-center text-[0.65rem] text-(--ui-text-quaternary)">
                  {locked ? 'Face locked — renaming won\u2019t change it.' : 'Face follows the name.'}
                </div>
                <Button
                  className="text-(--ui-text-tertiary)"
                  onClick={() => onShape(defaultShapeFor(pickerName))}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {b.avatar.classicShapes}
                </Button>
              </div>
            )
          })()
        ) : (
          <div className="grid justify-items-center gap-3">
            <div className="grid grid-cols-4 justify-items-center gap-1.5">
              {(blobatarSvg ? ['blobatar', ...AVATAR_PICKER_SHAPES] : AVATAR_PICKER_SHAPES).map(s => (
                <RowButton
                  className={cn(
                    'flex items-center justify-center rounded-md transition-colors hover:bg-(--chrome-action-hover)',
                    s === shape && !image && 'ring-1 ring-(--ui-accent)'
                  )}
                  key={s}
                  onClick={() => {
                    onImage(null)
                    onShape(s)
                  }}
                  style={{
                    width: 44,
                    height: 44
                  }}
                  title={s === 'blobatar' ? b.avatar.blobFromName : undefined}
                >
                  <BotFace color={avatarColor(color, pickerName)} name={pickerName} shape={s} size={32} />
                </RowButton>
              ))}
            </div>
            <ColorSwatches
              clearLabel={b.avatar.matchTheName}
              onChange={onColor}
              swatches={PROFILE_SWATCHES}
              value={color}
            />
          </div>
        )
      ) : null}
      {tab === 'upload' ? (
        <Button className="w-full justify-center" onClick={upload} type="button" variant="secondary">
          <Codicon className="mr-1 text-[0.8rem]" name="device-camera" />
          Choose an image…
        </Button>
      ) : null}
    </div>
  )
}
