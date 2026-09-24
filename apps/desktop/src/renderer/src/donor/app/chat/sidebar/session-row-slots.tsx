/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/session-row-slots.tsx
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { FC } from 'react'
import { useMemo } from 'react'

import { useContributions } from '@/contrib'
import { ContribBoundary, ContribRender } from '@/contrib/react/boundary'
import { type SessionRowSlotContribution } from '@/lib/session-row-slots'

/**
 * One row-decoration slot (leading / trailing) for `sessionId`. Mounts every
 * registration and lets each decide — it renders its decoration, or nothing at
 * all for rows it doesn't own.
 *
 * Mounting all of them (rather than first-wins) keeps ownership per session:
 * a plugin that declines a row must not suppress the one that owns it purely
 * on registration order. Two decorations on one row render both — a visible
 * composition, not a silent drop.
 */
const SessionRowSlotEntry: FC<{
  id: string
  render: SessionRowSlotContribution['render']
  sessionId: string
}> = ({ id, render, sessionId }) => {
  // Stable component identity: ContribRender mounts this AS a component, so a
  // fresh closure per render would remount the decoration on every tick.
  const renderSlot = useMemo(() => () => render({ sessionId }), [render, sessionId])

  return (
    <ContribBoundary id={id} variant="chip">
      <ContribRender render={renderSlot} />
    </ContribBoundary>
  )
}

export const SessionRowSlot: FC<{ area: string; sessionId: string }> = ({ area, sessionId }) => {
  const contributions = useContributions(area)

  if (contributions.length === 0) {
    return null
  }

  return (
    <>
      {contributions.map(contribution => {
        const render = (contribution.data as SessionRowSlotContribution | undefined)?.render

        return render ? (
          <SessionRowSlotEntry
            id={contribution.id}
            key={`${contribution.source ?? 'core'}:${contribution.id}`}
            render={render}
            sessionId={sessionId}
          />
        ) : null
      })}
    </>
  )
}
