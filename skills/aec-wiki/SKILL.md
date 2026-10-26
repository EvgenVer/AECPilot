---
name: aec-wiki
description: "Project wiki for AEC documents (Karpathy's LLM Wiki, adapted): build, update, lint and query interlinked pages with citations; add raw sources the index does not hold."
version: 2.1.0-aec.1
author: AECPilot (adapted from Hermes Agent llm-wiki)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [AEC, wiki, knowledge-base, documents, citations]
    category: research
---

<!--
PROVENANCE. Adapted from the core's bundled skill `llm-wiki` v2.1.0
(`skills/research/llm-wiki/SKILL.md`, hermes-agent tag v2026.9.24, commit
f97608f178d1ffeca59860195ab7da295f7c8e5f), MIT license, (c) Nous Research.
Their sections and rules are kept in their order; only what works differently in
AECPilot is changed (docs/history/specs/wiki.md §Overview). When the core pin moves, diff their
new text against this list and re-apply the edits — do not rewrite.

Edits:
 1. Location: the project's `<vault>/wiki/`, not `WIKI_PATH`; the skeleton comes from
    the `wiki_init` tool.
 2. Raw layer: two kinds — index snapshots written by `wiki_snapshot`, and sources
    added around the index by `wiki_add_raw` (`raw/user/<kind>/`). The agent never
    writes `raw/` itself and never saves `web_extract` output there.
 3. File names: the page title as is, in the wiki language (Cyrillic allowed), no
    transliteration — their "lowercase, hyphens" rule assumes Latin script.
 4. Provenance: our `[src: <source_id>/<rel_path>#<locator>](#cite)` on every fact,
    verbatim quotes through `rag_check_quote`, no computed values.
 5. Human edits are protected: `wiki_edited` before touching a page, pages written
    only through `wiki_write_page`, `wiki_checkpoint` at the end. Refusals come back
    as `{ok: false, refused}`; do not repeat the same call.
 6. Update by what changed: `wiki_stale`; new text through `rag_query`.
 7. Lint is code (`wiki_lint`), not a manual scan with `execute_code`.
 8. Only on command (SPEC UR6): no building, updating or filing answers into
    `queries/` on your own initiative.
 9. Contradictions: a visible block with both values, documents and dates; choosing
    the edition is the engineer's decision.
10. AEC domain: default SCHEMA, taxonomy and page types for design documentation.
11. Dropped: `WIKI_PATH`, Obsidian integration, Obsidian Headless / Sync, systemd,
    "Related Tools".
12. Added: the add-raw operation and "record this in the wiki" for a decision made in
    the conversation.
-->

# Project Wiki (LLM Wiki for AEC)

Build and maintain a persistent, compounding knowledge base as interlinked markdown files.
Based on [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Unlike plain document search (which rediscovers knowledge from scratch per query), the wiki
compiles knowledge once and keeps it current. Cross-references are already there.
Contradictions have already been flagged. Synthesis reflects everything ingested.

Design documentation arrives as dozens of files from different disciplines, in several
editions, with no overall picture. The wiki is that picture: one page per subject, facts
with citations to documents, links between pages — something an engineer returns to in six
months and still finds where a number came from.

**Division of labor:** The human curates sources and directs analysis. The agent
summarizes, cross-references, files, and maintains consistency.

**Only on command (SPEC UR6).** Build, update, add to or file into the wiki only when the
person asks. Indexing, a question about documents or any other work is not a reason.

## When This Skill Activates

Use this skill when the user:
- Asks to build, create or start the project wiki
- Asks to update the wiki by what changed
- Asks to add a source to the wiki, or to "record this in the wiki" (занеси в вики)
- Asks an overview question and the project wiki exists
- Asks to lint, check or audit the wiki

## Tools

MCP tools of the `aec-rag` server. If a tool is not in your list, load it by its exact
name through the tool search (`tool_describe`, then `tool_call`).

| Need | Tool |
|---|---|
| Create the skeleton before the first build | `mcp__aec_rag__wiki_init` |
| Write `raw/` snapshots of indexed documents | `mcp__aec_rag__wiki_snapshot` |
| Add a source the index does not hold | `mcp__aec_rag__wiki_add_raw` |
| What fell behind the index | `mcp__aec_rag__wiki_stale` |
| Which pages carry a human's work | `mcp__aec_rag__wiki_edited` |
| **Write a wiki page** | `mcp__aec_rag__wiki_write_page` |
| Record the wiki as you leave it | `mcp__aec_rag__wiki_checkpoint` |
| Mechanical check | `mcp__aec_rag__wiki_lint` |
| Project overview: entities, relations, coverage | `mcp__aec_rag__rag_overview` |
| A specific value or line | `mcp__aec_rag__rag_query` |
| Check a verbatim quote before writing it | `mcp__aec_rag__rag_check_quote` |
| How many documents are indexed | `mcp__aec_rag__rag_status` |
| Read pages; write anything outside `wiki/` | the regular file tools |

## Wiki Location

The wiki lives in the project: `<vault>/wiki/`, where `<vault>` is the project root (your
working directory). There is exactly one wiki per project; no environment variable picks it.

The wiki is just a directory of markdown files — the app renders it, and any editor opens it.

## Architecture: Three Layers

```
wiki/
├── SCHEMA.md           # Conventions, structure rules, domain config (the owner's rules)
├── index.md            # Sectioned content catalog with one-line summaries
├── log.md              # Chronological action log (append-only, rotated yearly)
├── raw/                # Layer 1: Immutable source material — written by tools only
│   ├── <snapshot>.md   # (a) snapshots of INDEXED documents (wiki_snapshot)
│   └── user/           # (b) sources added AROUND the index (wiki_add_raw)
│       ├── files/      #     a file: parsed text, the original is not copied
│       ├── links/      #     a web page's text + its URL
│       ├── notes/      #     pasted text, minutes, correspondence
│       └── decisions/  #     a decision the person asked to record
├── entities/           # Layer 2: the object, buildings, systems by discipline, other parties, TU documents
├── concepts/           # Layer 2: requirements and constraints, accepted decisions
├── comparisons/        # Layer 2: contradictions and editions side by side
└── queries/            # Layer 2: filed answers worth keeping (only on request)
```

**Layer 1 — Raw Sources:** Immutable. The agent reads but never modifies these.
**Layer 2 — The Wiki:** Agent-maintained markdown files — but a human edits them too
(see "Human Edits").
**Layer 3 — The Schema:** `SCHEMA.md` defines structure, conventions, and tag taxonomy.

Pages are written only to `entities/ concepts/ comparisons/ queries/`, `index.md` and
`log.md`. `wiki_write_page` refuses anything else — no new folders, no `…addendum.md`,
no `index_add.md`.

## Resuming an Existing Wiki (CRITICAL — do this every session)

When the project already has a wiki, **always orient yourself before doing anything**:

① **Read `wiki/SCHEMA.md`** — understand the domain, conventions, and tag taxonomy.
② **Read `wiki/index.md`** — learn what pages exist and their summaries.
③ **Scan recent `wiki/log.md`** — read the last 20-30 entries to understand recent activity.

Only after orientation should you build, update, add, query, or lint. This prevents:
- Creating duplicate pages for entities that already exist
- Missing cross-references to existing content
- Contradicting the schema's conventions
- Repeating work already logged

For large wikis (100+ pages), also run a quick `search_files` for the topic
at hand before creating anything new.

## Initializing a New Wiki

When the user asks to build the wiki and there is none yet:

1. `rag_status` — `files_indexed = 0` means there is nothing to build from: say so and
   offer to index the project.
2. `rag_overview` — what the project is, which entities and relations are visible. If
   `graph_scope.covers_whole_project` is `false`, **say before you start** that the wiki
   will cover part of the project, and how many documents are outside the graph.
3. `wiki_init()` — folders, the default `SCHEMA.md`, `index.md`, `log.md`. Safe to call again.
4. `wiki_snapshot()` — `raw/` snapshots of the indexed documents. Never copy document text
   into files yourself.
5. Continue with **Ingest** below for the indexed documents.

Do not rewrite `SCHEMA.md` without a direct request: it is the owner's rules, and its
rules beat the defaults written here.

### SCHEMA.md Template

`wiki_init` writes a default in Russian; the owner adapts it. Follow what the project's
`SCHEMA.md` says; where it is silent, these conventions apply:

```markdown
# Wiki Schema

## Domain
Design and working documentation of one construction project: the object, its buildings
and systems by discipline (ОВ, ВК, ЭОМ, КР, …), technical conditions, assignments from other
disciplines, requirements and accepted decisions.

## Conventions
- File names: the page title as is, in the wiki language (e.g. `ТП-1.md`,
  `Установленная мощность.md`). No transliteration, no empty names.
- Every wiki page starts with YAML frontmatter (see below)
- Use `[[wikilinks]]` to link between pages (minimum 2 outbound links per page)
- When updating a page, always bump the `updated` date
- Every new page must be added to `index.md` under the correct section
- Every action must be appended to `log.md`
- **Provenance:** every fact carries `[src: <source_id>/<rel_path>#<locator>](#cite)`;
  a fact from a raw source added around the index cites its `wiki/raw/user/...` path.

## Frontmatter
  ```yaml
  ---
  title: Page Title
  type: entity | concept | comparison | query
  tags: [from taxonomy below]
  sources: ["<source_id>/<rel_path>", "wiki/raw/user/notes/<name>.md"]
  updated: YYYY-MM-DD
  # Optional quality signals:
  confidence: high | medium | low        # how well-supported the claims are
  contested: true                        # set when the page has unresolved contradictions
  contradictions: [other-page]           # pages this one conflicts with
  ---
  ```
```

`confidence` and `contested` are optional. Lint surfaces unresolved contradictions for
review so weak claims don't silently harden into accepted wiki fact.

### raw/ Frontmatter

Raw sources carry a small frontmatter block so later runs can detect drift. The tools write
it — you never do:

- snapshots (a): `source_id`, `rel_path`, `sha256` (of the document in the index),
  `ingested_at`, `snapshot_at`, `type: raw`;
- added sources (b): `origin: user`, `kind`, `title`, `source_path` or `source_url`,
  `source_sha256` (of the original file), `added_at`, `sha256` of the body, `type: raw`.

`wiki_stale` compares them: a reissued document, or an original file changed on disk,
shows up as `changed`.

## Tag Taxonomy

Default AEC taxonomy (the owner extends it in `SCHEMA.md`):
`object, building, system/<discipline>, discipline, tu, task, constraint, decision,
contradiction, site`.

Rule: every tag on a page must appear in this taxonomy. If a new tag is needed,
add it to `SCHEMA.md` first, then use it. This prevents tag sprawl.

## Page Thresholds
- **Create a page** when an entity/concept appears in 2+ sources OR is central to one
  source (the object, a building, a system by discipline)
- **Add to existing page** when a source mentions something already covered
- **DON'T create a page** for passing mentions, minor details, or things outside the domain.
  Twenty useful pages beat two hundred stubs.
- **Split a page** when it exceeds ~200 lines — break into sub-topics with cross-links
- **Archive a page** when its content is fully superseded — only on the person's request

## Entity Pages
One page per notable entity. Include:
- Overview / what it is
- Key facts and values, each with its citation
- Relationships to other entities ([[wikilinks]])
- Source references

## Concept Pages
One page per requirement, constraint or decision. Include:
- What it requires, and where it comes from
- Current state: which documents state it, in which edition
- Open questions ("уточнить")
- Related pages ([[wikilinks]])

## Comparison Pages
Side-by-side analyses — typically two editions of an assignment. Include:
- What is being compared and why
- Dimensions of comparison (table format preferred)
- The values with documents and dates — no verdict on which edition is valid
- Sources

## Update Policy
When new information conflicts with existing content:
1. Check the dates — take them from the document text, not the file system; if there is
   none, write "date not stated"
2. If genuinely contradictory, note both positions with dates and sources in a
   contradiction block (below) and add a summary in `comparisons/`
3. Mark the contradiction in frontmatter: `contested: true`, `contradictions: [page]`
4. Flag it in your report. **Choosing the valid edition is the engineer's decision, not yours.**

```markdown
## Противоречие: установленная мощность

| Значение | Документ | Дата |
|---|---|---|
| 250 кВт | [src: tasks/ЭОМ/задание_ред2.pdf#p12](#cite) | 2026-03-14 |
| 180 кВт | [src: tasks/ЭОМ/задание.pdf#p11](#cite) | 2025-11-02 |

Действующая редакция не определена — решение за инженером.
```

The one exception: the page already described the old edition as old (inside a
contradiction block) and the new edition confirms it — then extend the block.

### Wiki language

Pages are written in the project's wiki language (`settings.wiki_lang`): `auto` means the
language of most sources — Russian for a Russian project; original terms in brackets when
needed. This skill is in English; the pages are not.

### index.md Template

The index is sectioned by type. Each entry is one line: wikilink + summary.

```markdown
# Wiki Index

> Content catalog. Every wiki page listed under its type with a one-line summary.
> Read this first to find relevant pages for any query.
> Last updated: YYYY-MM-DD | Total pages: N

## Entities
<!-- Alphabetical within section -->

## Concepts

## Comparisons

## Queries
```

**Scaling rule:** When any section exceeds 50 entries, split it into sub-sections
by first letter or discipline.

### log.md Template

```markdown
# Wiki Log

> Chronological record of all wiki actions. Append-only.
> Format: `## [YYYY-MM-DD] action | subject`
> Actions: build, update, add-raw, query, lint, archive

## [YYYY-MM-DD] build | Wiki initialized
- 14 pages from 23 documents; outside the graph: 0
- Contradictions recorded: 2 (ТП-1 power, ground floor level)
```

## Core Operations

### 1. Ingest (build, and every later addition)

Sources come from the index (the project's documents) or around it (`wiki_add_raw`).

① **Capture the raw source — with a tool, never by hand:**
   - Indexed document → `wiki_snapshot()` (or `wiki_snapshot(rel_paths=[…])` for a few).
   - Anything the index does not hold → **Add-raw** (operation 5 below).

② **Discuss takeaways** with the user when they asked for a single source — what matters for
   the project. (Skip this for a full build — proceed directly.)

③ **Check what already exists** — search `index.md` and use `search_files` to find
   existing pages for mentioned entities/concepts. This is the difference between
   a growing wiki and a pile of duplicates. A page whose name differs only by case, space,
   `_`/`-` or `№` **is the same page** — extend it.

④ **Write or update wiki pages — through `wiki_write_page`:**
   - **New entities/concepts:** Create pages only if they meet the Page Thresholds
   - **Existing pages:** Add new information to the existing page, bump `updated`.
     Never start a second page on the same subject. When new info contradicts existing
     content, follow the Update Policy.
   - **Every fact with a citation:** `[src: <source_id>/<rel_path>#<locator>](#cite)`.
     The locator comes from the result's `locator` field: `{"page": 12}` → `p12`,
     `{"sheet": "Ведомость", "range": "C5:D6"}` → `Ведомость!C5:D6`,
     `{"heading": "Кабельный журнал"}` → `h:Кабельный журнал`, `{}` → no `#` part at all.
     Unsure of the locator — leave it out: a link to the file is more honest than an
     invented anchor. A fact without a citation is an opinion and has no place in the wiki.
   - **Verbatim quotes through the check:** run a quoted sentence through
     `rag_check_quote` first; `ok: false` means it is not in the source, so it does not go
     on the page. Copy from the chunk text, never from memory.
   - **Don't compute values.** Sums over a schedule, differences between editions,
     percentages of a norm are not in the documents; on a page they look like a document's
     fact with nothing to cite. Give what is written; the engineer adds up with their own
     tolerances.
   - **Cross-reference:** Every new or updated page must link to at least 2 other
     pages via `[[wikilinks]]`. A link to a page not written yet is fine.
   - **Tags:** Only use tags from the taxonomy in SCHEMA.md
   - **Confidence:** For single-source or unclear claims, set `confidence: medium` or `low`.

⑤ **Update navigation:**
   - Add new pages to `index.md` under the correct section, alphabetically
   - Update the "Total pages" count and "Last updated" date in index header
   - Append to `log.md`: `## [YYYY-MM-DD] build | …` (or `update`, `add-raw`)
   - List every file created or updated in the log entry

⑥ **Checkpoint** — `wiki_checkpoint()` once, after every page is written.

⑦ **Report what changed** — how many pages, from how many documents, how many
   contradictions, what stayed uncovered. Don't retell the wiki: it was just written and
   will be read.

A single source can trigger updates across 5-15 wiki pages. This is normal
and desired — it's the compounding effect. **But ask before mass-updating:** if the run
would touch 10+ existing pages, name the number and the list and confirm first.

### 2. Update (by what changed)

Command: "update the wiki by the changes". Only on command.

① Orient (above), then `wiki_stale()`. Three lists, each handled differently:

| List | Meaning | Action |
|---|---|---|
| `changed` | the document was reissued, or an added file changed on disk | re-read it, update its pages |
| `new` | indexed but not in the wiki | decide by the Page Thresholds |
| `gone` | snapshot exists, document no longer indexed (or the added file is gone) | **delete nothing**; mark its pages "source detached" |

All three empty — say "the wiki matches the index, nothing to update" and stop.

② **Take the NEW text, not the old one.** Order matters:

```
wiki_snapshot(rel_paths: ["ЭОМ/задание_ред3.pdf"])   # refresh the snapshot first
rag_query("установленная мощность")                   # then read the new text
```

The snapshot in `raw/` is the old text by definition — it is there to compare against.
New text lives in the index and comes only through `rag_query`. If you made no `rag_query`
after `wiki_stale()`, you updated nothing. Re-read **only the affected documents**.

③ Human edits (next section) before touching any page; new value vs old — the Update
Policy, never a silent overwrite.

④ Bump `updated` only on pages you actually changed; log the run; `wiki_checkpoint()`.

### 3. Query

When the user asks an overview question about the project:

① **Read `index.md`** to identify relevant pages.
② **Check freshness — every time, before answering:** call `wiki_stale()`. If a source
   behind a page you will use changed after the wiki was built, the answer **starts** by
   saying the wiki is out of date for that topic, gives the current value from the
   document (`rag_query`) next to the wiki's, and offers «обнови вики». An answer from a
   stale page without this warning is worse than none.
③ **For wikis with 100+ pages**, also `search_files` across all `.md` files
   for key terms — the index alone may miss relevant content.
④ **Read the relevant pages** using `read_file`.
⑤ **Synthesize an answer** from the compiled knowledge. Cite the wiki pages
   you drew from ("по [[ТП-1]] и [[Электроснабжение]]…"); for an important fact also give
   the document citation the page carries.
⑥ **Empty or missing topic** — say so, and offer to build the wiki or to answer by
   document search (the `aec-qa` skill).
⑦ **File valuable answers back only on request** — a page in `queries/` or
   `comparisons/`; `queries/` is not a dump of everything ever asked.

### 4. Lint

When the user asks to check the wiki:

① `wiki_lint()` — the checks are code: broken `[[links]]`, orphan pages, pages whose
   source was reissued, malformed frontmatter, unresolved contradictions. Findings come
   worst-first: `error` (navigation broken today), `warning` (orphans, stale pages),
   `info` (unresolved contradictions — a question for the engineer, not a defect).

② **Report findings** grouped by kind with suggested actions ("four broken links on three
   pages"), not a flat list. Stale pages → suggest an update, not piecemeal fixes.
   Contradictions → name them, do not resolve them.

③ **Do not fix silently.** `[[Щитовая]]` without a page means either the page is not
   written yet or a human deleted it — ask. Check `wiki_edited()` before fixing anything.

④ **Append to log.md:** `## [YYYY-MM-DD] lint | N issues found`

### 5. Add-raw (a source the index does not hold)

Command: "add this to the wiki" for a file, a link, pasted text or minutes.

① `wiki_add_raw(kind, name, …)` — `name` is the source's short title:
   - `files` — `source_path`; the tool parses it like the index does (with page marks) and
     does not copy it;
   - `links` — fetch the page text yourself (`web_extract`), pass `text` and `source_url`;
   - `notes` — `text` (pasted text, minutes, correspondence).
② The result's `path` (`wiki/raw/user/...`) is what the pages cite.
③ Continue with Ingest ③–⑦ for that source.

The source does **not** enter the index or document search; that is a separate, explicit
request.

### 6. "Record this in the wiki" (a decision from the conversation)

When a decision was made in the conversation ("резерв мощности 10 % на ЩС-1 — согласовано
с заказчиком") and the person says "занеси в вики":

① `wiki_add_raw(kind="decisions", name="Решение пользователя от YYYY-MM-DD: <тема>",
   text=<the decision in the person's words, with who agreed and when>)`.
② Add the fact to the topic page with a citation to that `wiki/raw/user/decisions/...` path.
③ Log it and checkpoint.

Without the command the decision stays in project memory, not in the wiki.

## Human Edits (never overwritten)

The engineer adds what the documents do not hold: an oral agreement, a meeting conclusion,
"уточнить у заказчика". Erasing it is the worst thing you can do here: they will not know
the text is gone, and it cannot be restored.

**Before touching any page:** `wiki_edited()`.

| List | Meaning |
|---|---|
| `edited` | a human changed the page after you last wrote it |
| `unknown` | a human created it, or there is no record at all |

Both mean: **this page must not be rewritten wholesale.** Read it and edit in place — add
the fact to its section, update your own line, add a contradiction block. Paragraphs you did
not write stay as they are, even the ones that look inaccurate to you.

If you do write a page whole, **every paragraph you did not write must come back word for
word** — not retold, not tidied. `wiki_write_page` refuses a write that drops one, and names
it (measured: rewriting a page whole loses a human's line 5 times out of 5 even with the rule
read). On that refusal read the page, put the paragraph back verbatim and write again.

Cannot reconcile — the new statement directly contradicts what the human wrote — **don't
choose**: put both in a contradiction block (theirs as is, yours with the citation) and name
it in your report on its own line.

**Refusals are answers.** Tools return `{ok: false, refused: …}` for a refused call — it is
not a server failure. **Do not repeat the same call**, and do not work around it with new
folders or side files: fix what `refused` names.

## Working with the Wiki

### Searching

```
search_files "ТП-1" path="wiki" file_glob="*.md"          # pages by content
search_files "*.md" target="files" path="wiki"            # pages by file name
search_files "tags:.*system/ЭОМ" path="wiki" file_glob="*.md"  # pages by tag
read_file "wiki/log.md" offset=<last 20 lines>            # recent activity
```

### Bulk Ingest

When ingesting multiple sources at once, batch the updates:
1. Read all sources first
2. Identify all entities and concepts across all sources
3. Check existing pages for all of them (one search pass, not N)
4. Create/update pages in one pass (avoids redundant updates)
5. Update index.md once at the end
6. Write a single log entry covering the batch

### Archiving

Only on the person's request, when content is fully superseded:
1. Create `_archive/` if it doesn't exist
2. Move the page there with its original path (e.g. `_archive/entities/old-page.md`)
3. Remove it from `index.md`
4. Update pages that linked to it — replace the wikilink with plain text + "(archived)"
5. Log the archive action

## Pitfalls

- **Never modify files in `raw/`** — sources are immutable, and only tools write them.
  Corrections go in wiki pages.
- **Always orient first** — read SCHEMA + index + recent log before any operation in a new
  session. Skipping this causes duplicates and missed cross-references.
- **Check what exists before creating** — extend the existing page; never a second page on
  the same subject.
- **Always update index.md and log.md** — skipping this makes the wiki degrade. These are the
  navigational backbone.
- **Don't create pages for passing mentions** — follow the Page Thresholds.
- **Don't create pages without cross-references** — every page links to at least 2 others.
- **Frontmatter is required** — it enables search, filtering, and staleness detection.
- **Tags must come from the taxonomy** — add new tags to SCHEMA.md first.
- **Keep pages scannable** — split pages over 200 lines.
- **Nothing that is not in the documents** — general engineering knowledge is not a source;
  this project may differ.
- **Ask before mass-updating** — if a run would touch 10+ existing pages, confirm the scope
  with the user first.
- **Handle contradictions explicitly** — don't silently overwrite. Both values with dates and
  documents, marked in frontmatter, flagged for the engineer.
- **Only on command** — never build, update or file into the wiki on your own initiative.
