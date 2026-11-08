/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/rich-boundary.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered in place of the subtree when a render throws. */
  fallback: ReactNode
  /** Changing this clears a caught error (e.g. new source for a re-parse). */
  resetKey?: string
}

/**
 * Local boundary for rich renderers (Mermaid parse throws, malformed SVG, a
 * provider widget blowing up). A failed embed must never blank the transcript —
 * we show the `fallback` (typically the raw source) and recover when `resetKey`
 * changes. Unlike MessageRenderBoundary this swallows ALL render errors, because
 * the blast radius is one self-contained block, not the message tree.
 */
export class RichBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
