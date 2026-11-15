"""Task T62 (UR51): a Revit MCP server through the core's own MCP client, no model, no Revit.

Run by `revit-mcp-probe.mjs` with HERMES_HOME = a temporary profile copy whose `config.yaml`
names two copies of `fixtures/revit-mcp-stub.py` over stdio:

- `revit` with `trust: untrusted` — how UR51 wants a design-tool server connected;
- `revit_plain` without `trust` — what the MCP window writes today (the core reads a
  missing `trust` as `full`).

Checks (exit code 0 when all pass):

1. the server connects and the read tools answer without a question;
2. a write on `revit` asks first, and the question names the element and the value;
3. an answered "deny" blocks the write — the model is unchanged on the next read;
4. an answered "accept" lets it through — the next read sees the new value;
5. a deleting tool (`delete_element`) asks as well;
6. decision 0020 (UR51, 2026-11-15): a server as the MCP window writes it (`revit_plain`, no
   `trust`) writes WITHOUT a question from the program — the write rule is the agent's
   (skill `aec-revit`), so an engineer's explicit request is not asked again;
7. when the profile pins skills (`skills.auto_load`, as the app writes it), the core renders
   `aec-revit` into every new session with its write rule. Without `auto_load` the check is
   reported as skipped (a bare e2e-profile copy).

The approval surface is replaced by a recorder (`request_elicitation_consent`), as in
`mcp-features-probe.py`: in the app the same question goes to the window.
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    import tools.approval_prompt as approval_prompt
    from tools.mcp_tool_discovery import discover_mcp_tools
    from tools.registry import registry

    asked: list[dict] = []
    answers: list[str] = []

    def recorder(message, description, **kwargs):
        asked.append({"message": message, "title": kwargs.get("title")})
        return answers.pop(0) if answers else "deny"

    approval_prompt.request_elicitation_consent = recorder

    names = discover_mcp_tools()
    result: dict = {"tools": sorted(n for n in names if n.startswith("mcp__revit")), "checks": {}}
    checks = result["checks"]

    def call(name: str, args: dict) -> str:
        entry = (
            registry.get_entry(name) if hasattr(registry, "get_entry") else registry._tools[name]
        )
        return str(entry.handler(args))

    info = call("mcp__revit__get_document_info", {})
    walls = call("mcp__revit__list_elements", {"category": "Walls"})
    checks["reads_answer_without_question"] = (
        "Жилой дом" in info and "W-101" in walls and "F-201" not in walls and not asked
    )

    answers.append("deny")
    denied = call(
        "mcp__revit__set_element_parameter",
        {"element_id": "W-101", "name": "Height", "value": "3300"},
    )
    after_deny = call("mcp__revit__get_element", {"element_id": "W-101"})
    checks["write_asks_with_element_and_value"] = (
        len(asked) == 1 and "W-101" in asked[0]["message"] and "3300" in asked[0]["message"]
    )
    checks["deny_leaves_model_unchanged"] = (
        "3000" in after_deny and "3300" not in after_deny and "W-101.Height = 3300" not in denied
    )

    answers.append("accept")
    accepted = call(
        "mcp__revit__set_element_parameter",
        {"element_id": "W-101", "name": "Height", "value": "3300"},
    )
    after_accept = call("mcp__revit__get_element", {"element_id": "W-101"})
    checks["accept_changes_model"] = (
        len(asked) == 2 and "W-101.Height = 3300" in accepted and "3300" in after_accept
    )

    deleted = call("mcp__revit__delete_element", {"element_id": "W-102"})
    checks["delete_asks"] = len(asked) == 3 and "deleted" not in deleted

    before_plain = len(asked)
    plain = call(
        "mcp__revit_plain__set_element_parameter",
        {"element_id": "F-201", "name": "Thickness", "value": "250"},
    )
    checks["plain_server_writes_without_program_question"] = (
        len(asked) == before_plain and "F-201.Thickness = 250" in plain
    )

    from agent.skill_commands import build_auto_load_prompt, resolve_auto_load_skills

    if resolve_auto_load_skills():
        prompt, loaded, missing = build_auto_load_prompt()
        checks["write_rule_skill_pinned"] = (
            "aec-revit" in loaded and "Правило записи" in prompt and "aec-revit" not in missing
        )
        result["skills"] = {"loaded": loaded, "missing": missing}
    else:
        result["skills"] = "skipped: no skills.auto_load in this profile"
    result["reads"] = {"after_deny": after_deny[:160], "after_accept": after_accept[:160]}
    result["asked"] = asked
    result["ok"] = all(checks.values())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
