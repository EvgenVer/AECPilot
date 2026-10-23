# AECPilot — quickstart

AECPilot is an engineering workspace with an agent for building-design engineers. You
connect folders with the project's source data (other disciplines' assignments,
specifications, letters); the app indexes them, and the agent answers questions with
citations — clicking a citation opens the document at the right page.

## Requirements

- Windows 10 or 11, 64-bit.
- About 3 GB of free space for the program, plus room for data and project indexes.
- An API key for a model provider (for example Google Gemini), or a subscription the
  first-run wizard supports.
- No Python, Node.js or Git needed — everything ships inside the installation.

## Install

1. Run `AECPilot-<version>-win-x64.exe`.
2. **SmartScreen.** The installer is not code-signed, so Windows may say "Windows
   protected your PC". Click "More info", then "Run anyway".
3. Pick the installation folder. **Everything the app writes stays in that folder:**
   the program, the agent runtime and, under `data`, chats, agent memory, settings,
   model keys and schedules. Nothing is written to your user profile or `AppData`.
   No administrator rights are needed; the folder must be writable for you.
4. Pick a mode:
   - **Everything on this computer** — the usual choice for one workstation.
   - **Server only** — the agent core and the index run in the background at sign-in,
     without a window. Meant for the machine that holds the documents.
   - **App only** — this computer connects to an AECPilot server; it has no core and
     no index of its own.
5. Wait for it to finish. **It takes a while:** a fresh install or an update over the
   previous version takes about 10 minutes, longer on a slow disk. The package has about 60,000 files and
   the antivirus checks each one — that matters more than the computer's speed. The
   installer has not hung.

Silent install (for administrators):
`AECPilot-<version>-win-x64.exe /S /MODE=full /D=C:\AECPilot` (modes `full`, `server`,
`client`; `/D=` goes last, without quotes).

## First run

1. Start AECPilot from its shortcut. The first-run wizard asks for a model provider and
   a key. The key is kept in the installation's `data` folder.
2. **Create a project:** pick the project folder. The agent keeps notes and the project
   wiki there; the project's own files, including its index, live in `.aecpilot`.
3. **Connect sources:** in the "Sources" side panel → "Connect a folder". A source is a
   folder of input data; the agent only reads it.
4. **Index:** the "Index" page → "Index". Progress is shown while it runs; the first
   index of a large project takes time. After that the app checks sources on a
   schedule and notices new files by itself.
5. **Ask** in the chat, for example "What is the design load of panel ЩС-1?". The
   answer carries citations; clicking one opens the document at the right page.

## A server and connecting to it

Install a server in "Server only" mode on the machine that holds the documents. It
starts by itself when the user signs in and shows a tray icon:

- "Copy connection token" — the token for clients. It is persistent: it survives a
  server restart.
- "Issue a new token" — the old one stops working; clients need the new one.
- "Stop the server".

The server's gateway listens only on `127.0.0.1:18789` — it is not visible on the
network. A client reaches it through an SSH tunnel:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@server
```

Then in the client app: "Settings" → "Gateways" → "Remote gateway", address
`http://127.0.0.1:18789` and the token from the server. Projects then open on the
server's disk: you pick the project folder and sources in a dialog that browses the
server, and the server indexes and scans them — also while the laptop is closed. The
index stays on the server.

## Updating

When a new version is out, the app shows a notice with a "Download" button. Run the new
installer and pick the same folder: `data` and the project indexes are kept.

## Uninstalling

"Settings" → "Apps" → AECPilot → "Uninstall". Before removing anything the uninstaller
shows what will be removed. Two checkboxes, both off by default:

- "Also remove my data" — the `data` folder: chats, agent memory, settings, keys,
  schedules. Leave it off and reinstalling into the same folder brings everything back.
- "Also remove project indexes" — the `.aecpilot` folders of the listed projects.

Your documents and project folders are never removed. For "Server only" the uninstaller
also removes the sign-in task.

## Licenses

AECPilot is free to use; its terms are in `LICENSE.txt` in the program folder. Third-party
licenses are in `THIRD-PARTY-NOTICES.txt` next to it; the program also opens it:
Ctrl+K → «Third-party licenses».

## Troubleshooting

- **The install takes very long** — see above: this is normal, the installer has not hung.
- **The client cannot reach the server** — check the server's tray icon ("AECPilot
  server is running"), that the SSH tunnel is up, and that the token was copied after
  the last re-issue.
- **Logs** are in `<install folder>\data\userData\logs` and
  `<install folder>\data\profile\logs`.
