# THREAT MODEL — AECPilot

<!-- Project-specific security notes. Moved verbatim from the project section of the
     former toolkit file docs/SECURITY.md on 2026-10-15 (toolkit update); the generic
     toolkit policy now lives in .agents/docs/SECURITY.md. -->

## Project-specific threat notes (AECPilot)
Added 2026-08-05 with the course change; full risk register lives in `SPECIFICATION.md`.

### Trust boundaries — who is not trusted, and what follows
Recorded 2026-08-26 (finding D-51). All three were already enforced in code before they
were written down here, and that gap had a cost: with no adversary named, a security
finding cannot be ranked — "high" and "medium" decay into opinions, and a reviewer puts
an arbitrary-file read next to a preserved `mtime`. Ranking starts here.

1. **The agent is not trusted with a path.** It authors the citation text a viewer opens,
   it calls our MCP tools, and it demonstrably breaks a written rule when the rule is
   inconvenient — task 4.14 measured five violations out of five attempts. So: a path
   arriving from agent-authored text is resolved against a real root before anything
   reads or writes *through* it, and a tool enforces its own scope in code. A tool whose
   scope lives only in its description does not have one.
2. **The renderer is not trusted with a path, nor with consent.** The window is where
   somebody else's documents get rendered. "The window said so" is not evidence that a
   human chose anything: main issues a capability after a native dialog *it* opened, and
   consumes that capability on use (`apps/desktop/src/main/picked-paths.ts`, task 4D-11).
   A `confirmed: true` from the renderer is not consent, for the same reason a path from
   the renderer is not a choice. This does not weaken `contextIsolation`/`sandbox`/CSP —
   it is what remains true after they hold.
3. **Document content is data, never instructions.** The general rule above, restated
   here because this product exercises it daily: a drawing register, a spec PDF or a
   contractor's letter is retrieved, chunked, and put in front of a model that holds
   tools.

Where a check belongs follows from which boundary it guards, and the two run in different
places: the agent's paths are checked by the MCP tool that serves them, the renderer's by
the main process. A check on the wrong side of a boundary is decoration.

### Accepted risks — decided, not overlooked
Both were put to the owner on 2026-08-26 with the measurement in hand and decided there.
They are written down because an accepted risk that nobody recorded is indistinguishable
from one nobody noticed — and the next reviewer will raise them again otherwise.

- **A source's root is not a containment boundary (finding D-52).** `walk_files` guards
  against symlink/junction *cycles*, not against leaving the root, and on Windows an NTFS
  junction is the one link type Python does not report as a link (`os.path.islink` returns
  `False`; measured 2026-08-26 — a junction inside a source root yielded a file from
  outside it). Accepted: a junction inside a folder someone connected is treated as part
  of that folder. What that admits, stated plainly so nobody has to rediscover it: the
  contents behind such a junction are parsed, chunked, **sent to the embedding provider**,
  and can be quoted back in answers — including from a folder the person never meant to
  share, and including a junction that arrived inside an archive from outside. This is
  exfiltration through indexing, not code execution; it needs no agent cooperation and no
  exploit, but it does need a junction inside a folder the person connected themselves.
- **The core's filesystem API is trusted when the core runs on another machine (finding
  D-53).** In remote mode `viewer:read-document` hands the path to the core's
  `/api/fs/read-data-url` unchecked. The desktop does not know that machine's roots, so a
  client-side path check would assert something it cannot know. Accepted: we start that
  core ourselves over ssh, the files are its own, and the boundary — if one is wanted —
  belongs on its side, not here.

Revisit either when the reasoning behind it changes: a source that can be connected
without a person picking the folder, or a remote core we no longer start ourselves.

### Specific notes
- **Core plugin directory is a code-execution path (R11).** Hermes loads any ESM file from
  `$HERMES_HOME/desktop-plugins/<id>/plugin.js` into its renderer with gateway RPC access,
  and the agent can write files. The directory exists whether or not we use it. We ship no
  loader of our own (SPEC HX5), keep that directory outside the agent's working folder, and
  inspect its contents on every core upgrade.
- **External channels move project data outward (R10).** Messaging, A2A, and outbound
  webhooks (UR19) make an agent that can read project files reachable from outside. They
  ship **disabled by default**; enabling one is an explicit user action that first lists
  what leaves the machine (AC10). Outbound payloads are signed.
- **Provider keys never touch plaintext.** Keys live only in our `safeStorage` and reach
  the core through spawn-env. `model.save_key` (writes plaintext to `.env`) and
  `POST /api/env/reveal` (returns the key in clear) are never called. `config.get
  {key:"full"}` returns MCP env unmasked — prefer the REST equivalent, which redacts.
- **Renderer never opens a socket to the gateway** (SPEC C9). Donor components are adapted
  to our IPC bridge; `contextIsolation` and `sandbox` stay on, including for the artifact
  preview sandbox (UR22).
- **Core is pinned by commit SHA, never by tag** (SPEC C1). PyPI publication ended in
  0.20.0; a tag can be moved by its author, a SHA cannot. No auto-update of the core.

