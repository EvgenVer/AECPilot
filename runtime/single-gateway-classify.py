"""Static routing of every JSON-RPC method on the single gateway's native socket (task T53.1).

A socket admitted with a native `interactive` ticket is dispatched by the session authority
(`gateway/session_controls.py`, `AuthorityConnection.dispatch`): its own handlers, the group
controls and `profiles.list`; a method it does not know gets -32601, and `tui_gateway/ws.py`
then falls back to the legacy handler in `tui_gateway.server._methods` unless
`tui_gateway/ws_legacy_fallback.py` refuses it (session namespaces, process-global verbs).

This script reproduces that decision from the core's own tables, so the live probe
(`runtime/single-gateway-probe.mjs`) can compare it with what the gateway answers and so the
methods with outside effects (a paid model call, the microphone) are classified without being
called. Run with the core's interpreter and a throwaway HERMES_HOME:
    <python> single-gateway-classify.py [<out.json>]
writes one JSON object {method: route} to <out.json> (or prints it), route one of:
authority, group, legacy, refused.
"""

import json
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.getcwd())

import tui_gateway.server as server  # noqa: E402  (fills server._methods at import)
from gateway.session_controls import AuthorityConnection  # noqa: E402
from gateway.session_group_controls import GROUP_METHODS  # noqa: E402
from tui_gateway.contracts.registry import CANONICAL_METHODS  # noqa: E402
from tui_gateway.ws_legacy_fallback import (  # noqa: E402
    _PROCESS_GLOBAL,
    _SESSION_FALLBACK_ALLOWED,
    _SESSION_NAMESPACES,
)

# The handler table only binds names; a stand-in instance is enough to read its keys.
authority = set(AuthorityConnection.handlers(MagicMock()).keys())
groups = set(GROUP_METHODS) | {"profiles.list"}
legacy = set(server._methods)


def route(method: str) -> str:
    if method in groups:
        return "group"
    if method in authority:
        return "authority"
    if method not in legacy:
        return "refused"
    if method in _PROCESS_GLOBAL:
        return "refused"
    if method.startswith(_SESSION_NAMESPACES) and method not in _SESSION_FALLBACK_ALLOWED:
        return "refused"
    return "legacy"


names = sorted(authority | groups | legacy | set(CANONICAL_METHODS))
result = json.dumps({name: route(name) for name in names})
# The gateway's import routes stdout to stderr (stdout is its protocol channel): the answer
# goes to the file named on the command line when there is one.
if len(sys.argv) > 1:
    with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as handle:
        handle.write(result)
else:
    print(result)
