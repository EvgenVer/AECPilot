"""What the index holds, file by file (task 3J.8, SPEC UR44).

The Index page used to see only the files of the run in progress; a document
skipped or failed three runs ago was invisible, and «is this file in the
index?» had no answer short of asking the agent. This module answers it for
every file the scanner knows, in one pass over ``index.db`` plus the graph
choice in ``project.json``. It only reads.

Index state of a file:

- ``indexed`` — its current content is in the index;
- ``stale`` — an older content is, the file changed since;
- ``missing`` — never indexed yet;
- ``failed`` — the last attempt at THIS content failed (``error`` says why);
- ``skipped`` — not indexable at all: ``reason`` is ``unsupported`` (format),
  ``too_large`` or ``unreadable`` (the scanner could not hash it).

Graph state: ``in`` (current content), ``stale`` (older content), ``marked``
(inside the chosen scope, not added yet), ``none``.
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

from aec_rag.errors import UNSUPPORTED
from aec_rag.graph_scope import ScopeEntry, covers
from aec_rag.parse import SUPPORTED_SUFFIXES

INDEX_STATES = ("indexed", "stale", "missing", "failed", "skipped")
GRAPH_STATES = ("in", "stale", "marked", "none")


def empty_inventory() -> dict[str, Any]:
    """The answer for a project that was never scanned — not an error."""
    return {"index_exists": False, "files": [], "summary": _summary([])}


def inventory(
    conn: sqlite3.Connection, scope: list[ScopeEntry], source_ids: list[str]
) -> dict[str, Any]:
    """Every live file of ``source_ids`` with its index, scan and graph state."""
    ingested = _by_file(conn, "SELECT source_id, rel_path, sha256 FROM ingested_files")
    in_graph = _by_file(conn, "SELECT source_id, rel_path, sha256 FROM graph_documents")
    errors: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for source_id, rel_path, sha256, stage, code, detail, at in conn.execute(
        "SELECT source_id, rel_path, sha256, stage, code, detail, at FROM file_errors"
    ):
        errors.setdefault((source_id, rel_path), []).append(
            {"stage": stage, "code": code, "detail": detail, "at": at, "sha256": sha256}
        )
    scans: dict[tuple[str, str, str], dict[str, Any]] = {}
    for source_id, rel_path, sha256, state, error in conn.execute(
        "SELECT source_id, rel_path, sha256, state, error FROM pdf_pages ORDER BY page"
    ):
        entry = scans.setdefault(
            (source_id, rel_path, sha256), {"done": 0, "total": 0, "failed": 0, "error": None}
        )
        entry["total"] += 1
        if state == "done":
            entry["done"] += 1
        elif state == "failed":
            entry["failed"] += 1
            entry["error"] = entry["error"] or error

    placeholders = ",".join("?" for _ in source_ids)
    rows = conn.execute(
        f"""
        SELECT source_id, rel_path, size, sha256, skip_reason FROM files
        WHERE status IN ('ok', 'changed') AND source_id IN ({placeholders})
        ORDER BY source_id, rel_path
        """,
        source_ids,
    ).fetchall()

    files = []
    for source_id, rel_path, size, sha256, skip_reason in rows:
        key = (source_id, rel_path)
        # An error recorded for an older content says nothing about this one.
        current_errors = [e for e in errors.get(key, []) if e["sha256"] == sha256]
        index_error = next((e for e in current_errors if e["stage"] == "index"), None)
        graph_error = next((e for e in current_errors if e["stage"] == "graph"), None)

        reason = None
        if sha256 is None:
            state, reason = "skipped", skip_reason or "unreadable"
        elif Path(rel_path).suffix.lower() not in SUPPORTED_SUFFIXES:
            state, reason = "skipped", UNSUPPORTED
        elif index_error is not None:
            state = "failed"
        elif ingested.get(key) == sha256:
            state = "indexed"
        elif key in ingested:
            state = "stale"
        else:
            state = "missing"

        if key in in_graph:
            graph = "in" if in_graph[key] == sha256 else "stale"
        elif state != "skipped" and any(covers(entry, source_id, rel_path) for entry in scope):
            graph = "marked"
        else:
            graph = "none"

        scan = scans.get((source_id, rel_path, sha256))
        files.append(
            {
                "source_id": source_id,
                "rel_path": rel_path,
                "size": size,
                "index": state,
                "reason": reason,
                "scans": scan,
                "graph": graph,
                "errors": [
                    {k: e[k] for k in ("stage", "code", "detail", "at")}
                    for e in (index_error, graph_error)
                    if e is not None
                ],
            }
        )

    return {"index_exists": True, "files": files, "summary": _summary(files)}


def _by_file(conn: sqlite3.Connection, query: str) -> dict[tuple[str, str], str]:
    return {(source_id, rel_path): sha256 for source_id, rel_path, sha256 in conn.execute(query)}


def _summary(files: list[dict[str, Any]]) -> dict[str, Any]:
    index = Counter(file["index"] for file in files)
    graph = Counter(file["graph"] for file in files)
    scans = [file["scans"] for file in files if file["scans"]]
    return {
        "files": len(files),
        "index": {state: index.get(state, 0) for state in INDEX_STATES},
        "graph": {state: graph.get(state, 0) for state in GRAPH_STATES},
        "scans": {
            "files": len(scans),
            "pages_done": sum(scan["done"] for scan in scans),
            "pages_total": sum(scan["total"] for scan in scans),
            "pages_failed": sum(scan["failed"] for scan in scans),
        },
        "with_errors": sum(
            1 for file in files if file["errors"] or (file["scans"] and file["scans"]["failed"])
        ),
    }
