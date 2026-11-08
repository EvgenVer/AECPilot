"""A tiny MCP server for `mcp-features-probe.mjs` (task T55): the shape of a design-tool
server such as Revit or Lira Support, without the design tool.

- `list_levels` — read-only (`readOnlyHint`), answers at once;
- `run_check` — a long computation that reports progress (`notifications/progress`);
- `set_parameter` — write-capable (no read-only hint): on a `trust: untrusted` server the
  core asks the person first, and its `tool_costs` entry makes it a paid call.

Runs on the core's own MCP SDK (2.x, `MCPServer`).

Usage: python mcp-probe-server.py stdio
       python mcp-probe-server.py http <port>
"""

from __future__ import annotations

import asyncio
import sys

from mcp.server.mcpserver import Context, MCPServer
from mcp.types import ToolAnnotations

server = MCPServer(name="aec-probe")


@server.tool(annotations=ToolAnnotations(readOnlyHint=True))
def list_levels() -> str:
    """The levels of the model."""
    return "Level 1, Level 2, Roof"


@server.tool(annotations=ToolAnnotations(readOnlyHint=True))
async def run_check(steps: int, ctx: Context) -> str:
    """A long check that reports how far it got."""
    for step in range(1, steps + 1):
        await asyncio.sleep(0.6)
        await ctx.report_progress(step, steps, f"step {step} of {steps}")
    return f"checked in {steps} steps"


@server.tool()
def set_parameter(element: str, name: str, value: str) -> str:
    """Changes one parameter of one element."""
    return f"{element}.{name} = {value}"


if __name__ == "__main__":
    if sys.argv[1:2] == ["http"]:
        server.run("streamable-http", host="127.0.0.1", port=int(sys.argv[2]))
    else:
        server.run("stdio")
