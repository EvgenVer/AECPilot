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

/** Same job as their `MarkdownLink`: a link in an answer opens in the OS
 * browser, never in this window. The `href` stays on the element (so the
 * target is visible in the tooltip and copyable), but the click is always
 * cancelled — main decides whether the URL may be opened at all, because the
 * renderer is the side displaying text it did not author. Whatever slips
 * past this handler (middle click, keyboard "open in new window") is caught
 * by the window guards in main (task 1.6.4a). */
function ExternalLink({ children, href, ...props }: ComponentProps<'a'>): JSX.Element {
  return (
    <a
      {...props}
      className="chat-markdown__link"
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault()
        if (href) void window.aecpilot.openExternalLink(href)
      }}
    >
      {children}
    </a>
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

/** Task 1.6.10: streamdown ships its own English labels for the controls it
 * renders (the copy/download buttons on a code block, the table menu). They
 * are tooltips, so they are easy to miss — and just as easy to translate,
 * since the library takes a `translations` override. Only the keys for
 * surfaces we actually render are listed; anything not listed keeps their
 * default, which is correct for features we do not enable (mermaid, images). */
const RU_TRANSLATIONS = {
  copyCode: 'Копировать код',
  downloadFile: 'Скачать файл',
  copyTable: 'Копировать таблицу',
  copyTableAsMarkdown: 'Копировать таблицу как Markdown',
  copyTableAsCsv: 'Копировать таблицу как CSV',
  copyTableAsTsv: 'Копировать таблицу как TSV',
  copyLink: 'Копировать ссылку'
}

export function MarkdownTextContent({
  text,
  isRunning
}: {
  text: string
  isRunning: boolean
}): JSX.Element {
  const components = useMemo(
    () => ({ a: ExternalLink, table: ScrollableTable }) as StreamdownTextComponents,
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
        translations={RU_TRANSLATIONS}
      />
    </TextMessagePartProvider>
  )
}
