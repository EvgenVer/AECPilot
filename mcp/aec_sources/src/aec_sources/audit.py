"""Best-effort JSONL journal of rejected access attempts (task 1.17).

specs/workspace-sources.md (Data schemas): ``<vault>/.aecpilot/logs/`` —
"журнал операций и отклонённых попыток записи". A failure to write the
journal (disk full, permissions, ...) must never break the tool call it is
recording, so ``log_rejected`` never raises: any ``OSError`` while creating
the directory or appending the line is swallowed silently.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

LOG_FILENAME = "sources-rejected.jsonl"


def logs_dir_from_project(project_json_path: Path) -> Path:
    """Derive the project's logs directory from its ``project.json`` path.

    ``project_json_path`` is ``<vault>/.aecpilot/project.json``; the journal
    lives alongside it at ``<vault>/.aecpilot/logs/``.
    """
    return project_json_path.parent / "logs"


def log_rejected(logs_dir: Path, entry: dict[str, object]) -> None:
    """Append one rejected-attempt ``entry`` as a JSON line to
    ``<logs_dir>/sources-rejected.jsonl``, additively (existing content is
    never overwritten).

    A ``ts`` (ISO-8601 UTC) timestamp is added automatically. ``logs_dir`` is
    created if it doesn't exist yet. Never raises: any ``OSError`` is
    swallowed, since the journal is best-effort and must not fail the tool
    call it records.
    """
    line_entry = {"ts": datetime.now(UTC).isoformat(), **entry}
    try:
        logs_dir.mkdir(parents=True, exist_ok=True)
        with (logs_dir / LOG_FILENAME).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(line_entry, ensure_ascii=False) + "\n")
    except OSError:
        pass
