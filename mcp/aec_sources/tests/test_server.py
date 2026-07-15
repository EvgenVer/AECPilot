import pytest
from aec_sources.server import build_server
from mcp.shared.memory import create_connected_server_and_client_session

EXPECTED_TOOL_NAMES = {"sources_list", "sources_tree", "sources_read", "sources_stat"}


@pytest.mark.anyio
async def test_tools_list_has_exactly_the_four_contract_tools():
    server = build_server()

    async with create_connected_server_and_client_session(server) as client:
        result = await client.list_tools()

    names = {tool.name for tool in result.tools}
    assert len(result.tools) == 4
    assert names == EXPECTED_TOOL_NAMES


@pytest.mark.anyio
async def test_stub_tools_return_not_implemented_error():
    """sources_read remains a stub in this task (1.10); real impl lands in 1.11."""
    server = build_server()

    async with create_connected_server_and_client_session(server) as client:
        result = await client.call_tool("sources_read", {"source_id": "x", "path": "y"})

    assert result.isError is True
