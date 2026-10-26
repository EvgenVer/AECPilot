"""Parsing of ``project.json`` for the aec-rag scan CLI.

See docs/history/specs/workspace-sources.md (Data schemas) for the full project.json
shape. This module only needs the ``sources`` field — a list of
{id, root_path, ...} — same contract as
mcp/aec_sources/src/aec_sources/config.py's ``parse_project_config``,
duplicated here rather than imported: aec_rag and aec_sources are separate
uv workspace packages and neither depends on the other.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


class ProjectConfigError(Exception):
    """Raised when project.json is missing, malformed, or missing required fields."""


@dataclass(frozen=True)
class SourceRoot:
    """A single configured read-only source root."""

    id: str
    root_path: str


def parse_project_config(project_path: Path) -> list[SourceRoot]:
    """Read ``project_path`` and return the configured source roots.

    Raises ProjectConfigError with a human-readable message if the file is
    missing, is not valid JSON, or does not declare a ``sources`` field.
    """
    if not project_path.is_file():
        raise ProjectConfigError(f"project.json not found: {project_path}")

    try:
        data = json.loads(project_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProjectConfigError(f"project.json is not valid JSON: {project_path} ({exc})") from exc

    if not isinstance(data, dict) or "sources" not in data:
        raise ProjectConfigError(
            f"project.json is missing required field 'sources': {project_path}"
        )

    sources = data["sources"]
    if not isinstance(sources, list):
        raise ProjectConfigError(f"project.json field 'sources' must be a list: {project_path}")

    roots: list[SourceRoot] = []
    for index, entry in enumerate(sources):
        if not isinstance(entry, dict):
            raise ProjectConfigError(
                f"project.json sources[{index}] must be an object, got {entry!r}"
            )

        entry_id = entry.get("id")
        if not isinstance(entry_id, str) or not entry_id.strip():
            raise ProjectConfigError(
                f"project.json sources[{index}].id must be a non-empty string, got {entry_id!r}"
            )

        root_path = entry.get("root_path")
        if not isinstance(root_path, str) or not root_path.strip():
            raise ProjectConfigError(
                f"project.json sources[{index}].root_path must be a non-empty string, "
                f"got {root_path!r}"
            )

        roots.append(SourceRoot(id=entry_id, root_path=root_path))
    return roots
