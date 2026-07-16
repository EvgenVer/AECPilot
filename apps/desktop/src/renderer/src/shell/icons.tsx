// Minimal outline icon set for the workspace shell (task 1.0). No icon
// package is added as a dependency (out of scope for this task) — these are
// small inline SVGs, hand-transcribed from the icon paths already used in
// design/screens/*.html.
//
// Attribution: every path below is an unmodified Lucide icon
// (https://lucide.dev) — files, search, book, database (renamed
// `sources`/SourcesIcon here), brain (`memory`/MemoryIcon), file-text
// (`docs`/DocsIcon), bot (`agent`/AgentIcon), settings, refresh-cw (`scan`),
// chevron-down, arrow-up (`send`/SendIcon), paperclip (`attach`/AttachIcon).
// None of these paths were drawn from scratch here.
//
// Lucide is ISC-licensed:
//   ISC License — Copyright (c) for portions of Lucide are held by Cole
//   Bemis 2013-2022 as part of Feather (MIT). All other copyright for
//   Lucide is held by Lucide Contributors 2022.
//   Permission to use, copy, modify, and/or distribute this software for
//   any purpose with or without fee is hereby granted, provided the above
//   copyright notice and this permission notice appear in all copies.
//   Full license text: https://github.com/lucide-icons/lucide/blob/main/LICENSE

import type { JSX, SVGProps } from 'react'

function Svg(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export function FilesIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M4 13V4a2 2 0 0 1 2-2h8l6 6v3" />
      <path d="M2 15h10" />
      <path d="M9 12l3 3-3 3" />
    </Svg>
  )
}

export function SearchIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  )
}

export function BookIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </Svg>
  )
}

export function SourcesIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </Svg>
  )
}

export function MemoryIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2Z" />
    </Svg>
  )
}

export function DocsIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M8 13h8M8 17h5" />
    </Svg>
  )
}

export function AgentIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="4" y="8" width="16" height="12" rx="2.5" />
      <path d="M12 4v4M9 14h.01M15 14h.01M2 13v2M22 13v2" />
    </Svg>
  )
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  )
}

export function ScanIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </Svg>
  )
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  )
}

export function SendIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  )
}

export function AttachIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Svg>
  )
}

const ACTIVITY_ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  explorer: FilesIcon,
  qa: SearchIcon,
  wiki: BookIcon,
  sources: SourcesIcon,
  memory: MemoryIcon,
  documents: DocsIcon,
  agent: AgentIcon
}

export function activityIcon(id: string): (props: SVGProps<SVGSVGElement>) => JSX.Element {
  return ACTIVITY_ICONS[id] ?? FilesIcon
}
