"""Task T55: what core 0.23 adds for MCP, measured through its own MCP client, no model.

Run by `mcp-features-probe.mjs` with HERMES_HOME = a temporary profile copy whose
`config.yaml` already names two copies of `fixtures/mcp-probe-server.py`: `probe_stdio`
(stdio, trusted) and `probe_http` (Streamable HTTP, `trust: untrusted`, `set_parameter`
costs 2 credits, spend limit 3 per chat). Checks:

1. both transports connect and a read-only tool answers;
2. a long tool's `notifications/progress` reach the agent's progress callback as
   `tool.progress` events with a percent (what the window shows on the tool row);
3. a write tool on an untrusted server asks first, and the question carries the call's
   arguments and its declared cost;
4. the second paid call, which would pass the chat's limit, asks again and says so;
   an answered "deny" blocks the call.

The approval surface is replaced by a recorder (`request_elicitation_consent`): in the app
the same question goes to the window as a server request, which the e2e on the mock
gateway already covers. Prints one JSON object; exit code 0 = every check passed.
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    import tools.approval_prompt as approval_prompt
    from agent.tool_progress_relay import bound_tool_progress
    from tools.mcp_tool_discovery import discover_mcp_tools
    from tools.registry import registry

    asked: list[dict] = []
    answers = iter(["accept", "deny"])

    def recorder(message, description, **kwargs):
        asked.append({"message": message, "description": description, "title": kwargs.get("title")})
        return next(answers, "deny")

    approval_prompt.request_elicitation_consent = recorder

    names = discover_mcp_tools()
    result: dict = {"tools": sorted(n for n in names if n.startswith("mcp__probe")), "checks": {}}
    checks = result["checks"]

    def call(name: str, args: dict, **kwargs) -> str:
        entry = (
            registry.get_entry(name) if hasattr(registry, "get_entry") else registry._tools[name]
        )
        return str(entry.handler(args, **kwargs))

    stdio = call("mcp__probe_stdio__list_levels", {})
    http = call("mcp__probe_http__list_levels", {})
    checks["stdio_and_http_answer"] = "Level 1" in stdio and "Level 1" in http

    events: list[dict] = []

    def progress_cb(event_type, name, preview, args, **kwargs):
        events.append({"type": event_type, "name": name, "message": preview, **kwargs})

    with bound_tool_progress(progress_cb, "mcp__probe_stdio__run_check", "call-1"):
        done = call("mcp__probe_stdio__run_check", {"steps": 3})
    result["progress"] = events
    checks["progress_events"] = (
        "checked in 3 steps" in done
        and len(events) >= 2
        and all(e["type"] == "tool.progress" for e in events)
        and events[-1].get("percent") == 100
    )

    first = call(
        "mcp__probe_http__set_parameter", {"element": "Wall-12", "name": "Height", "value": "3200"}
    )
    second = call(
        "mcp__probe_http__set_parameter", {"element": "Wall-13", "name": "Height", "value": "3300"}
    )
    result["asked"] = asked
    result["calls"] = {"first": first[:200], "second": second[:300]}
    checks["untrusted_write_asks_with_arguments_and_cost"] = (
        len(asked) >= 1
        and "Wall-12" in asked[0]["message"]
        and "3200" in asked[0]["message"]
        and "2 credits" in asked[0]["message"]
        and "Wall-12.Height = 3200" in first
    )
    checks["over_limit_asks_again_and_deny_blocks"] = (
        len(asked) == 2 and "spend limit" in asked[1]["message"] and "Wall-13.Height" not in second
    )

    result["ok"] = all(checks.values())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
