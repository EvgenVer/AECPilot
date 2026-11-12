"""A stand-in for a Revit MCP server (task T62, UR51): the shape of the official Autodesk
server and the community ones — read the open model, change it — without Revit.

The model is a small in-memory document that lives as long as the server process, so a
write that went through is visible to the next read and a refused one is not.

- `get_document_info`, `list_elements`, `get_element` — read-only (`readOnlyHint`);
- `set_element_parameter`, `delete_element` — write-capable (no read-only hint; delete is
  `destructiveHint`): on a `trust: untrusted` server the core asks the person first.

Tool names are ours, not Autodesk's: the check is the read/write split and the question
before a write, which is what the core decides from the annotations.

Usage: python revit-mcp-stub.py stdio
"""

from __future__ import annotations

import json

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

server = MCPServer(name="revit-stub")

MODEL = {
    "title": "Жилой дом, секция 1",
    "elements": {
        "W-101": {"category": "Walls", "Level": "Level 1", "Height": "3000", "Mark": "НС-1"},
        "W-102": {"category": "Walls", "Level": "Level 1", "Height": "3000", "Mark": "НС-2"},
        "F-201": {"category": "Floors", "Level": "Level 2", "Thickness": "220", "Mark": "П-1"},
    },
}

READ = ToolAnnotations(readOnlyHint=True)


@server.tool(annotations=READ)
def get_document_info() -> str:
    """The open Revit document: its title and how many elements it has."""
    return json.dumps(
        {"title": MODEL["title"], "elements": len(MODEL["elements"])}, ensure_ascii=False
    )


@server.tool(annotations=READ)
def list_elements(category: str = "") -> str:
    """Element ids of the model, optionally of one category (Walls, Floors, ...)."""
    ids = [
        key
        for key, element in MODEL["elements"].items()
        if not category or element["category"] == category
    ]
    return json.dumps(ids)


@server.tool(annotations=READ)
def get_element(element_id: str) -> str:
    """All parameters of one element."""
    element = MODEL["elements"].get(element_id)
    return json.dumps(element, ensure_ascii=False) if element else f"no element {element_id}"


@server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False))
def set_element_parameter(element_id: str, name: str, value: str) -> str:
    """Changes one parameter of one element in the model."""
    element = MODEL["elements"].get(element_id)
    if element is None:
        return f"no element {element_id}"
    element[name] = value
    return f"{element_id}.{name} = {value}"


@server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True))
def delete_element(element_id: str) -> str:
    """Deletes one element from the model."""
    return (
        f"deleted {element_id}"
        if MODEL["elements"].pop(element_id, None)
        else f"no element {element_id}"
    )


if __name__ == "__main__":
    server.run("stdio")
