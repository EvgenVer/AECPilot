/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/shiki-plain.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Matches highlighted markup so loading a grammar changes color, not layout. */
export function PlainShiki({ code }: { code: string }) {
  return (
    <div className="rs-root not-prose">
      <pre className="shiki" style={{ backgroundColor: 'transparent', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
