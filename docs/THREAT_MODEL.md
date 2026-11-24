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
  **Re-examined 2026-10-21 (security review of phase 3, T43):** the server installation
  (UR25, T32) starts its core itself, at logon, so "we start it over ssh" no longer holds
  for that mode. The acceptance stands on a different ground, which is stronger: the
  server's gateway listens on 127.0.0.1 only (`runtime/serve.mjs` `SERVE_HOST`, measured
  by AC11.1), so a client reaches it only through a tunnel to that machine, and the
  gateway token (192 random bits, kept encrypted by DPAPI, `main/server-token.ts`) is
  handed out from the server's own tray. Whoever holds both already has a session on the
  server; the core's terminal tool gives that session everything `read-data-url` does.
  The token *is* the server's file system — treat copying it like sharing an ssh key.
  A plain `http://` address to a non-loopback host is accepted by the client
  (`normalizeRemoteUrl`) and would carry the token in clear text; today nothing listens
  there, because the server binds loopback only.

Revisit either when the reasoning behind it changes: a source that can be connected
without a person picking the folder, or a server gateway that listens beyond loopback.

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
- **The agent backup to a file (UR57) never passes through the renderer.** The archive
  holds the profile's `.env` and sign-ins in clear. The renderer may only start
  `POST /api/ops/backup` without an `output` path, and only when the core runs on this
  machine. The routes that read an archive back (`/api/ops/backup/download`, `/chunk`), the
  Hermes Cloud transfer, and any REST call whose path, query or body names a backup archive
  or a `backups` folder (the core's general file routes would serve the zip) are denied.
  The main process takes only an archive a backup of this run wrote, checks it lies in a
  `backups` folder of the core home (no network paths, links resolved), copies it through
  Save As from a handle opened by that check, and deletes it; archives nobody saved are
  deleted at quit.
- **Dictation: the microphone opens for a press, and the sound stays with the core (UR49).**
  `preload` — the isolated world — refuses the request without a live user gesture
  (`navigator.userActivation`); main then lets the microphone out for one stream within ten
  seconds, to that window's main frame only (`permission-policy.ts`). A page in the preview, a
  frame, another window and the camera get nothing. What this does not stop: code already
  running inside our own window can ask within the few seconds after ANY press or keystroke
  in it — the gesture proves a person at the keyboard, not the microphone button.
  Before the microphone opens, and again before the recording is sent (the agent can edit
  `config.yaml`, and a recording lasts up to minutes), main asks the CORE which recogniser it
  will use (`GET /api/config` of that profile) and refuses unless it is the local one with the
  model of ours — on this machine by the exact folder, on a server by the folder's name. The
  file is brought to order with a YAML parser at start, at every recording and, on a server,
  every 30 seconds; what decides is the core's answer, not the file. The window's own ways to
  a cloud recogniser — the live WebSocket and the direct provider call with its key — have no
  caller (`voice-boundary.test.ts`), and the RPC verbs that open the HOST's microphone are
  denied to the window. Voice messages of the messengers stay unrecognised (`stt_enabled:
  false` in `gateway.json`); a Discord voice channel and the Teams meeting pipeline call the
  recogniser past that switch — both channels are off by default, and the recogniser they
  reach is the same local one. Not covered: a plugin the owner installs may hook the core's
  `pre_transcription` and choose another model.
- **The dictation model is downloaded by us, not by the core.** Left alone, the core fetches
  it from Hugging Face without asking on the first recording. Recognition stays off until a
  person presses "Download and turn on"; the files come from one pinned commit and each is
  checked against its SHA256; the core gets the folder's path, so it does not touch the
  network. On a server the consent is asked on the server machine, from its tray — a client
  over the network cannot make it download anything. The consent is a dialog of the window,
  which trust boundary 2 does not count as proof: the worst a compromised window gains is
  the download of one fixed, verified file.
- **Renderer never opens a socket to the gateway** (SPEC C9). Donor components are adapted
  to our IPC bridge; `contextIsolation` and `sandbox` stay on, including for the artifact
  preview sandbox (UR22).
- **Core is pinned by commit SHA, never by tag** (SPEC C1). PyPI publication ended in
  0.20.0; a tag can be moved by its author, a SHA cannot. No auto-update of the core.

