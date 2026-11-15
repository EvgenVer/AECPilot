"""Tasks T67/T68 (UR51): the real Autodesk Revit MCP server through the core's own MCP client.

Run by `revit-mcp-live-probe.mjs` with HERMES_HOME = a temporary profile copy whose
`config.yaml` names one server `revit` (the Autodesk stdio executable), with or without
`trust`. Revit must be running with a model open: the stdio server only proxies the tools
of the Revit add-in it finds over a named pipe, and announces them with `tools/list_changed`.

Modes (REVIT_PROBE_MODE):

- `read` (default) — connect, wait for Revit's tools, list them with the core's read-only
  verdict, call the read-only tools `get_running_revit_instances` and `get_active_context`.
  Never calls a tool the core does not see as read-only.
- `steps` — `read`, then the calls in REVIT_PROBE_STEPS (JSON list of
  `{"tool", "args", "answer": "deny"|"accept", "keep": chars}`), in order; `answer` is what
  the recorder replies if the core asks. Records whether the core asked and the question.
  On `trust: untrusted` a denied write never reaches Revit; WITHOUT `trust` every write goes
  through — run write steps only on a document the owner named for it.

The approval surface is replaced by a recorder (`request_elicitation_consent`), as in
`revit-mcp-probe.py`: in the app the same question goes to the window.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time

READS = ("get_running_revit_instances", "get_active_context")
# Registered by the core itself next to a server that advertises resources/prompts; the
# Revit tools proper arrive later, from the add-in.
CORE_UTILITIES = {"list_resources", "read_resource", "list_prompts", "get_prompt"}
STDIO_OWN = {"get_running_revit_instances"} | CORE_UTILITIES


def main() -> int:
    import tools.approval_prompt as approval_prompt
    import tools.mcp_tool as core
    from tools.mcp_tool_discovery import discover_mcp_tools
    from tools.mcp_tool_scope import _resolve_server_key
    from tools.registry import registry

    mode = os.environ.get("REVIT_PROBE_MODE", "read")
    asked: list[dict] = []
    answers: list[str] = []

    def recorder(message, description, **kwargs):
        asked.append({"message": message, "title": kwargs.get("title")})
        return answers.pop(0) if answers else "deny"

    approval_prompt.request_elicitation_consent = recorder

    def revit_tools() -> list[str]:
        return sorted(n for n in registry._tools if n.startswith("mcp__revit__"))

    def from_addin() -> list[str]:
        return [n for n in revit_tools() if n.removeprefix("mcp__revit__") not in STDIO_OWN]

    discover_mcp_tools()
    deadline = time.monotonic() + float(os.environ.get("REVIT_PROBE_WAIT", "40"))
    while time.monotonic() < deadline and not from_addin():
        time.sleep(1)
    time.sleep(2)  # let a second list_changed (more instances, more tools) settle

    hints = core._tool_read_only_hints.get(_resolve_server_key("revit"), {})
    names = revit_tools()
    result: dict = {
        "mode": mode,
        "trust": core._server_trust_levels.get(_resolve_server_key("revit")),
        "tool_count": len(names),
        "addin_tool_count": len(from_addin()),
        "read_only": sorted(n for n in names if hints.get(n.removeprefix("mcp__revit__")) is True),
        "write_capable": sorted(
            n for n in names if hints.get(n.removeprefix("mcp__revit__")) is not True
        ),
        "reads": {},
    }

    def call(name: str, args: dict) -> str:
        return str(registry._tools[name].handler(args))

    # Every Revit tool takes the Revit process id; with one Revit running the server picks it
    # itself, with several it refuses. REVIT_PID chooses; otherwise the first one listed.
    pid = os.environ.get("REVIT_PID")
    for short in READS:
        full = f"mcp__revit__{short}"
        if full not in names or hints.get(short) is not True:
            continue
        own = short == "get_running_revit_instances"
        args = {} if own or pid is None else {"revitInstanceId": int(pid)}
        out = call(full, args)
        result["reads"][short] = out[:1500]
        if short == "get_running_revit_instances" and pid is None:
            found = re.findall(r"processId\D{0,8}(\d+)", out, re.IGNORECASE)
            pid = found[0] if found else None
    result["revit_pid"] = pid
    result["reads_asked"] = list(asked)

    if mode == "steps":
        result["steps"] = []
        for spec in json.loads(os.environ["REVIT_PROBE_STEPS"]):
            full = f"mcp__revit__{spec['tool']}"
            if full not in names:
                result["steps"].append({"tool": spec["tool"], "error": "not registered"})
                continue
            before = len(asked)
            answer = spec.get("answer", "deny")
            answers[:] = [answer]
            args = dict(spec.get("args", {}))
            if pid is not None:
                args.setdefault("revitInstanceId", int(pid))
            out = call(full, args)
            answers.clear()
            result["steps"].append(
                {
                    "tool": spec["tool"],
                    "read_only": hints.get(spec["tool"]) is True,
                    "answer_if_asked": answer,
                    "asked": len(asked) > before,
                    "question": asked[before]["message"][:600] if len(asked) > before else None,
                    "result": out[: int(spec.get("keep", 800))],
                }
            )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["addin_tool_count"] else 1


if __name__ == "__main__":
    sys.exit(main())
