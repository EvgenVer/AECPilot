"""D-153: a missing or broken project.json must not kill the server at start.

On hermes 0.21.5 a stdio server that exits at start is parked after three
attempts and retried every five minutes, and the core's health proof then
wrongly degraded the sibling servers (aec-rag, aec-roster) — the agent lost
every aec tool. The server now starts anyway and every tool answers with the
configuration error, the way aec-rag already does per call.
"""

import pytest
from aec_sources import __main__ as entry
from aec_sources.server import build_server
from mcp_harness import connected_session


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("tool", "args"),
    [
        ("sources_list", {}),
        ("sources_tree", {"source_id": "src"}),
        ("sources_read", {"source_id": "src", "path": "a.txt"}),
        ("sources_stat", {"source_id": "src", "path": "a.txt"}),
    ],
)
async def test_every_tool_reports_the_config_error(tool, args):
    server = build_server(config_error="project.json not found: X:\\gone\\project.json")

    async with connected_session(server) as client:
        result = await client.call_tool(tool, args)

    assert result.is_error is True
    assert "project.json not found" in result.content[0].text


def test_main_serves_instead_of_exiting_when_project_is_missing(tmp_path, monkeypatch):
    served = {}

    def fake_run(self, transport):
        served["transport"] = transport
        served["error"] = self.config_error

    monkeypatch.setattr(type(build_server()), "run", fake_run)

    code = entry.main(["--project", str(tmp_path / "gone" / "project.json")])

    assert code == 0
    assert served["transport"] == "stdio"
    assert "project.json not found" in served["error"]
    assert not (tmp_path / "gone").exists()  # no journal folder created for a missing project
