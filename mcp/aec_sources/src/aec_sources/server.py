"""MCP server `aec-sources`: read-only access to project sources.

Contract: docs/history/specs/workspace-sources.md (API contracts). Tools are read-only by
construction; no write/delete tools exist for sources.

All 4 read-only tools (sources_list/sources_tree/sources_read/sources_stat)
are implemented here. Every path-taking tool reuses
``aec_sources.paths.resolve_in_root`` (task 1.10) for anti-traversal.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import CallToolResult, InputRequiredResult

if TYPE_CHECKING:
    from mcp.server.mcpserver.server import Context

from aec_sources.audit import log_rejected
from aec_sources.config import SourceRoot
from aec_sources.fs import list_directory, list_roots_status, read_file_range, stat_path
from aec_sources.paths import PathOutsideSourceError, resolve_in_root


class _AuditingMCPServer(MCPServer):
    """MCPServer that also journals calls to tool names it doesn't register at
    all — e.g. an agent guessing at a write/delete tool
    (``sources_write``/``sources_delete``/...) that simply doesn't exist,
    read-only by construction (docs/history/specs/workspace-sources.md). Calls to the 4
    registered tools are journaled from inside their bodies instead (see
    ``_resolve`` below), since only there is the source/path context
    available; here we only see the raw ``name``.

    ``logs_dir`` is ``None`` (the default) when the caller of
    ``build_server`` didn't request journaling; in that case this behaves
    exactly like plain ``MCPServer``.
    """

    logs_dir: Path | None = None

    async def call_tool(
        self, name: str, arguments: dict[str, Any], context: Context | None = None
    ) -> CallToolResult | InputRequiredResult:
        # `_tool_manager` is a private MCPServer internal (pinned mcp>=2,<3); if a
        # dependency bump renames/removes it, this silently stops journaling —
        # caught by test_unknown_write_like_tool_call_is_error_and_journaled
        # (the journal simply won't be created).
        #
        # It survived 1.x -> 2.0 unchanged, name and `get_tool(name) -> Tool | None`
        # contract both (measured, task 3.B0a). What DID change is this method's own
        # signature — the third `context` parameter and the result type — and that
        # failure is loud: a mismatched override raises TypeError on the first call.
        if self.logs_dir is not None and self._tool_manager.get_tool(name) is None:
            log_rejected(self.logs_dir, {"event": "unknown_tool", "tool": name})
        return await super().call_tool(name, arguments, context)


def build_server(
    roots: list[SourceRoot] | None = None,
    logs_dir: Path | None = None,
    config_error: str | None = None,
) -> MCPServer:
    """Construct the aec-sources MCP server with the 4 read-only tools registered.

    ``roots`` are the configured source roots (parsed from project.json).
    ``logs_dir`` is the project's rejected-attempts journal directory (see
    ``aec_sources.audit``); ``None`` (the default, for backward
    compatibility with existing callers/tests) disables journaling.
    ``config_error`` is set when project.json could not be read at start: the
    server still runs and every tool answers with it (D-153 — a server that
    exits at start is parked by the core and takes its siblings down with it).
    """
    server = _AuditingMCPServer(name="aec-sources")
    server.source_roots = list(roots or [])
    server.logs_dir = logs_dir
    server.config_error = config_error

    def _check_config() -> None:
        if server.config_error is not None:
            raise ToolError(f"project is not available: {server.config_error}")

    def _find_root(source_id: str) -> SourceRoot:
        _check_config()
        for root in server.source_roots:
            if root.id == source_id:
                return root
        raise ToolError(f"unknown source id {source_id!r}")

    def _resolve(source: SourceRoot, path: str | None, tool: str) -> Path:
        root = Path(source.root_path)
        if not root.is_dir():
            raise ToolError(f"source {source.id!r} root is unavailable: {source.root_path}")
        try:
            target = resolve_in_root(root, path)
            exists = target.exists()
        except PathOutsideSourceError as exc:
            if server.logs_dir is not None:
                log_rejected(
                    server.logs_dir,
                    {
                        "event": "path_outside_source",
                        "tool": tool,
                        "source_id": source.id,
                        "path": path,
                        "reason": str(exc),
                    },
                )
            raise ToolError(str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise ToolError(
                f"invalid path in source {source.id!r}: {path!r} ({type(exc).__name__})"
            ) from exc
        if not exists:
            raise ToolError(f"path not found in source {source.id!r}: {path!r}")
        return target

    @server.tool(description="List configured read-only source roots and their availability.")
    def sources_list() -> list[dict]:
        _check_config()
        return list_roots_status(server.source_roots)

    @server.tool(
        description="List directory entries (name, type, size, mtime) under a source root."
    )
    def sources_tree(source_id: str, path: str | None = None) -> list[dict]:
        source = _find_root(source_id)
        target = _resolve(source, path, "sources_tree")
        try:
            is_dir = target.is_dir()
            if not is_dir:
                raise ToolError(f"path is not a directory in source {source_id!r}: {path!r}")
            return list_directory(target)
        except (OSError, ValueError) as exc:
            raise ToolError(
                f"unable to list path in source {source_id!r}: {path!r} ({type(exc).__name__})"
            ) from exc

    # --8<-- [start:sources_read]
    @server.tool(
        description=(
            "Read a file's content from a source root, as text (UTF-8, invalid bytes "
            "replaced). Without range, the whole file is read, but rejected with an "
            "error if it is larger than 10 MiB — pass range instead. range is "
            "[offset, length], byte offsets into the file (length capped at 10 MiB); "
            "an offset past end-of-file yields an empty string."
        )
    )
    def sources_read(source_id: str, path: str, range: list[int] | None = None) -> str:
        source = _find_root(source_id)
        target = _resolve(source, path, "sources_read")
        if target.is_dir():
            raise ToolError(f"path is not a file in source {source_id!r}: {path!r}")
        try:
            return read_file_range(target, range)
        except ValueError as exc:
            raise ToolError(str(exc)) from exc
        except OSError as exc:
            raise ToolError(
                f"unable to read path in source {source_id!r}: {path!r} ({type(exc).__name__})"
            ) from exc

    # --8<-- [end:sources_read]
    @server.tool(
        description=(
            "Get file/directory metadata (size, mtime) for a path in a source root. "
            "sha256 is not computed in this version (see task 1.13, the indexer)."
        )
    )
    def sources_stat(source_id: str, path: str) -> dict[str, object]:
        source = _find_root(source_id)
        target = _resolve(source, path, "sources_stat")
        try:
            return stat_path(target)
        except (OSError, ValueError) as exc:
            raise ToolError(
                f"unable to stat path in source {source_id!r}: {path!r} ({type(exc).__name__})"
            ) from exc

    return server
