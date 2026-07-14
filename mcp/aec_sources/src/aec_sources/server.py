"""MCP server `aec-sources`: read-only access to project sources.

Contract: specs/workspace-sources.md (API contracts). Tools are read-only by
construction; no write/delete tools exist for sources.

The 4 tools below are stubs for this task (1.9) — each raises a ToolError
("not implemented"). Real implementations land in tasks 1.10 (list/tree/stat)
and 1.11 (read, with anti-traversal).
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from aec_sources.config import SourceRoot


def build_server(roots: list[SourceRoot] | None = None) -> FastMCP:
    """Construct the aec-sources MCP server with the 4 read-only tools registered.

    ``roots`` are the configured source roots (parsed from project.json); they
    are stored on the server for the real implementations in tasks 1.10/1.11
    and are unused by the current stub tool bodies.
    """
    server = FastMCP(name="aec-sources")
    server.source_roots = list(roots or [])

    @server.tool(description="List configured read-only source roots and their availability.")
    def sources_list() -> list[dict]:
        raise ToolError("sources_list is not implemented yet (see task 1.10)")

    @server.tool(
        description="List directory entries (name, type, size, mtime) under a source root."
    )
    def sources_tree(source_id: str, path: str | None = None) -> list[dict]:
        raise ToolError("sources_tree is not implemented yet (see task 1.10)")

    @server.tool(description="Read file content (optionally a byte range) from a source root.")
    def sources_read(source_id: str, path: str, range: list[int] | None = None) -> str:
        raise ToolError("sources_read is not implemented yet (see task 1.11)")

    @server.tool(description="Get file metadata (size, mtime, sha256) for a path in a source root.")
    def sources_stat(source_id: str, path: str) -> dict:
        raise ToolError("sources_stat is not implemented yet (see task 1.10)")

    return server
