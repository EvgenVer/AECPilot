import pytest
from aec_sources.config import SourceRoot
from aec_sources.server import build_server
from mcp_harness import connected_session

# T78 (UR52) added `sources_extract`: a source document as text, still read-only.
EXPECTED_TOOL_NAMES = {
    "sources_list",
    "sources_tree",
    "sources_read",
    "sources_extract",
    "sources_stat",
}


@pytest.mark.anyio
async def test_tools_list_has_exactly_the_contract_tools():
    server = build_server()

    async with connected_session(server) as client:
        result = await client.list_tools()

    names = {tool.name for tool in result.tools}
    assert len(result.tools) == len(EXPECTED_TOOL_NAMES)
    assert names == EXPECTED_TOOL_NAMES


@pytest.mark.anyio
async def test_sources_read_on_a_directory_is_error(tmp_path):
    """sources_read only reads files (task 1.11); a directory path is rejected."""
    root = tmp_path / "source-root"
    (root / "sub").mkdir(parents=True)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with connected_session(server) as client:
        result = await client.call_tool("sources_read", {"source_id": "src", "path": "sub"})

    assert result.is_error is True
