/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/shiki-plain.tsx
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
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
