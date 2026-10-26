"""Best-effort JSONL journal of rejected access attempts (task 1.17).

docs/history/specs/workspace-sources.md (Data schemas): ``<vault>/.aecpilot/logs/`` —
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

#: Size at which the journal is rolled over. One previous generation is kept
#: alongside it, so the journal costs at most twice this on disk.
MAX_LOG_BYTES = 1024 * 1024

#: Suffix of the kept generation, i.e. ``sources-rejected.jsonl.1``.
ROTATED_SUFFIX = ".1"


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
    created if it doesn't exist yet. Once the journal outgrows
    ``MAX_LOG_BYTES`` it is rolled over (see ``_rotate_if_large``). Never
    raises: any ``OSError`` is swallowed, since the journal is best-effort and
    must not fail the tool call it records.
    """
    line_entry = {"ts": datetime.now(UTC).isoformat(), **entry}
    try:
        logs_dir.mkdir(parents=True, exist_ok=True)
        journal = logs_dir / LOG_FILENAME
        _rotate_if_large(journal)
        with journal.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(line_entry, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _rotate_if_large(journal: Path) -> None:
    """Move the journal aside once it outgrows ``MAX_LOG_BYTES``.

    One generation is kept and the one before it is dropped. The journal
    exists to explain a rejection that just happened, so the recent lines are
    the valuable ones; an unbounded file on the user's disk is a worse answer
    than a bounded one. A missing journal is not an error — that is the first
    call.
    """
    try:
        if journal.stat().st_size < MAX_LOG_BYTES:
            return
    except FileNotFoundError:
        return
    journal.replace(journal.with_name(journal.name + ROTATED_SUFFIX))
