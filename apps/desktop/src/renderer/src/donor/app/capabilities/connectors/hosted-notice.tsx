/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/hosted-notice.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { openFreeTierSignIn } from '@/store/free-tier-sign-in'

import type { HostedPhase } from './types'

function SignInNote({ text }: { text: string }) {
  const { t } = useI18n()

  return (
    <p className="flex shrink-0 items-center gap-1 text-[0.7rem] text-(--ui-text-tertiary)">
      {text}
      <Button onClick={() => openFreeTierSignIn()} size="xs" variant="text">
        {t.connectorsPage.page.signIn}
      </Button>
    </p>
  )
}

export function HostedNotice({ hasGuest, phase }: { hasGuest: boolean; phase: HostedPhase }) {
  const { t } = useI18n()
  const copy = t.connectorsPage.page

  if (phase === 'signedOut') {
    return <SignInNote text={copy.signInLine} />
  }

  if (phase === 'unavailable') {
    return <p className="shrink-0 text-[0.7rem] text-(--ui-text-tertiary)">{copy.managedUnavailable}</p>
  }

  return hasGuest ? <SignInNote text={copy.freeTierNote} /> : null
}
