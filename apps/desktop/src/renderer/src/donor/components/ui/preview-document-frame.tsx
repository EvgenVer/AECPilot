/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/preview-document-frame.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type IframeHTMLAttributes, useCallback, useEffect, useRef } from 'react'

import { browserBootstrap, endpointUrl } from '@/lib/browser-transport'
import { isBrowserHostedDesktop } from '@/lib/platform'

interface PreviewDocumentFrameProps extends IframeHTMLAttributes<HTMLIFrameElement> {
  srcDoc: string
}

/** A served preview gets its own CSP; srcdoc would inherit the renderer's. */
export function PreviewDocumentFrame({ srcDoc, sandbox, ...props }: PreviewDocumentFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const browser = isBrowserHostedDesktop()
  const src = browser ? endpointUrl('/assets/webapp-preview.html', browserBootstrap()?.basePath || '').href : undefined
  const scripts = sandbox === 'allow-scripts'

  const send = useCallback(() => {
    if (browser) {
      frame.current?.contentWindow?.postMessage({ type: 'hermes-preview-document', html: srcDoc, scripts }, '*')
    }
  }, [browser, srcDoc, scripts])

  useEffect(send, [send])

  if (!browser) {
    return <iframe {...props} sandbox={sandbox} srcDoc={srcDoc} />
  }

  return <iframe {...props} onLoad={send} ref={frame}
    referrerPolicy="no-referrer" sandbox="allow-scripts" src={src} />
}
