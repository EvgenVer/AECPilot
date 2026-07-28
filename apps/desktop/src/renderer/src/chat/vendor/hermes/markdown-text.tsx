import { TextMessagePartProvider } from '@assistant-ui/react'
import {
  StreamdownTextPrimitive,
  type StreamdownTextComponents
} from '@assistant-ui/react-streamdown'
import { code } from '@streamdown/code'
import { useMemo, type ComponentProps, type JSX } from 'react'

/**
 * Markdown rendering for the agent's answers — vendored from Hermes (task
 * 1.6.4, transfer rule "variant C": batch 1 takes their components, batches
 * 2-7 only read their code).
 *
 * Source: `apps/desktop/src/components/assistant-ui/markdown-text.tsx`,
 * NousResearch/hermes-agent (MIT). Their file is 717 lines because it also
 * carries surfaces we do not have yet; what survives here is its spine —
 * `TextMessagePartProvider` + `StreamdownTextPrimitive`, entered through
 * their own `MarkdownTextContent(text, isRunning)` seam, which is exactly the
 * seam for a caller that does NOT (yet) drive an assistant-ui runtime. Our
 * transcript keeps its own state until task 1.6.6 brings their timeline.
 *
 * Deliberately NOT taken, with where each returns:
 * - Shiki `SyntaxHighlighter` component + `ansi`/terminal output — task
 *   1.6.11. Fenced code is still highlighted, by streamdown's own `code`
 *   plugin (the package the owner approved in 1.6.1); 1.6.11 decides the
 *   separate highlighter for tool output.
 * - KaTeX math plugin — out of scope for phase 1.6 (spec Non-goals).
 * - Media attachments, url embeds, zoomable images, preview targets — they
 *   ride on their `hermesDesktop` bridge and their preview panel (batch 6).
 * - `HugeTextFallback` — needs their `ExpandableBlock` (task 1.6.7).
 * - `useSmoothReveal` / `DeferStreamingText` — streaming *performance* work
 *   (rAF-paced reveal, `useDeferredValue`) for 50KB+ messages; the primitive
 *   itself already exposes `smooth`/`defer` props, so this is one prop away
 *   if a real slowdown shows up. Not taken on speculation.
 * - Their block-parse LRU and hand-rolled tail-remend — `@assistant-ui/react-
 *   streamdown` 0.3.x does the tail-bounded repair itself whenever
 *   `mode="streaming"` (see its `StreamdownText.js`), which is what makes
 *   half-arrived markdown settle instead of flashing.
 * - Their Tailwind class strings on every element — we add no Tailwind
 *   (decision C), so they would be inert. Styling lives in shell.css on our
 *   tokens; this is the "repaint" of task 1.6.10 for this one surface.
 */

/** Their `MarkdownLink` hands external URLs to the OS browser through their
 * desktop bridge. We have no such bridge, and a live `<a href>` here would let
 * agent-authored text navigate the renderer itself — which still carries the
 * preload API. So a link renders as its own text, non-navigating, with the
 * target in the tooltip. Opening links for real needs main-process work
 * (`setWindowOpenHandler` deny + `will-navigate` guard + `shell.openExternal`
 * with a protocol allowlist) — filed as a separate task, not smuggled in
 * here. */
function InertLink({ children, href }: ComponentProps<'a'>): JSX.Element {
  return (
    <span className="chat-markdown__link" title={href}>
      {children}
    </span>
  )
}

/** Kept from their overrides for the reason they kept it: the chat dock is
 * narrow, and a wide table has to scroll inside its own box instead of
 * stretching the message.
 *
 * `node` is the mdast node the markdown pipeline hands to every custom
 * component; it must be dropped, not spread — React would otherwise write
 * `node="[object Object]"` onto the DOM element (observed, not theorised). */
function ScrollableTable({ node, ...props }: ComponentProps<'table'> & { node?: unknown }) {
  void node
  return (
    <div className="chat-markdown__table">
      <table {...props} />
    </div>
  )
}

export function MarkdownTextContent({
  text,
  isRunning
}: {
  text: string
  isRunning: boolean
}): JSX.Element {
  const components = useMemo(
    () => ({ a: InertLink, table: ScrollableTable }) as StreamdownTextComponents,
    []
  )
  const plugins = useMemo(() => ({ code }), [])

  return (
    <TextMessagePartProvider isRunning={isRunning} text={text}>
      <StreamdownTextPrimitive
        components={components}
        containerClassName="chat-markdown"
        lineNumbers={false}
        plugins={plugins}
      />
    </TextMessagePartProvider>
  )
}
