"""Anti-traversal path resolution for source roots.

Shared by every tool that turns a client-supplied relative path into a real
filesystem path inside a source root: ``sources_tree``/``sources_stat`` in
this task (1.10), and ``sources_read`` in task 1.11.
"""

from __future__ import annotations

import re
from pathlib import Path

# A path component that, once trailing whitespace is stripped, is made up
# entirely of dots (".. ", "...", "....", etc). Windows silently strips
# trailing dots/spaces from path components and has historically treated
# such components ambiguously wrt directory traversal; rather than rely on
# that (undocumented, OS-version-dependent) behavior, we reject them
# outright. A lone "." is unaffected (harmless "current directory").
_ALL_DOTS_RE = re.compile(r"^\.{2,}$")


class PathOutsideSourceError(Exception):
    """The requested path is absolute or escapes its source root.

    Corresponds to the contract error code PATH_OUTSIDE_SOURCE
    (docs/history/specs/workspace-sources.md).
    """


def resolve_in_root(root: Path, rel_path: str | None) -> Path:
    """Resolve ``rel_path`` against ``root``, rejecting any escape attempt.

    ``rel_path`` may be ``None`` or empty, meaning "the root itself". Rejected
    outright, before ever touching the filesystem:
    - an absolute ``rel_path`` (including UNC paths);
    - any component that is ``".."`` or, after stripping trailing whitespace,
      made up entirely of dots (e.g. ``".. "``, ``"..."``) — Windows'
      trailing dot/space trimming makes these ambiguous;
    - any component containing ``:`` (drive-relative paths like ``"C:foo"``
      or ``"C:"``, and NTFS alternate-data-stream syntax) — ``:`` is not a
      legal character in a real Windows filename, so this can never reject
      a legitimate path.

    The combined path is then resolved and, as defense in depth, checked to
    still be nested inside ``root``. The check is case-insensitive and
    separator-agnostic on Windows, matching pathlib's native ``WindowsPath``
    semantics. Does not require the path to exist.

    Raises ``PathOutsideSourceError`` on any violation.
    """
    root = Path(root)
    if not rel_path:
        return root

    candidate = Path(rel_path)
    if candidate.is_absolute():
        raise PathOutsideSourceError(f"PATH_OUTSIDE_SOURCE: path escapes source root: {rel_path!r}")
    for part in candidate.parts:
        if ":" in part or _ALL_DOTS_RE.match(part.rstrip()):
            raise PathOutsideSourceError(
                f"PATH_OUTSIDE_SOURCE: path escapes source root: {rel_path!r}"
            )

    resolved = (root / candidate).resolve()
    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError:
        raise PathOutsideSourceError(
            f"PATH_OUTSIDE_SOURCE: path escapes source root: {rel_path!r}"
        ) from None

    return resolved
