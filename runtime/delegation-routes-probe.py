"""Task T54 (UR48): subagent model routes on the real core, without a model call.

Run by `delegation-routes-probe.mjs` with HERMES_HOME = a temporary profile copy that
already has the `advanced-delegation` plugin installed and enabled, and a fake provider
key in the environment (the way our app hands the core its keys). Checks:

1. the core discovers the plugin and lists its two backends;
2. a model route saved through the core's own REST handler (the one their routes editor
   calls) names a provider and carries no key;
3. the core resolves that route to the provider's key from the environment;
4. `config.yaml` holds no key afterwards.

Prints one JSON object; exit code 0 = every check passed.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

FAKE_KEY = os.environ["AEC_PROBE_FAKE_KEY"]
PROVIDER = os.environ.get("AEC_PROBE_PROVIDER", "openrouter")
MODEL = "probe/cheap-model"


def main() -> int:
    from hermes_cli.plugins import discover_plugins
    from hermes_cli.web_models import DelegationBackendSelect, DelegationModelMapUpdate
    from hermes_cli.web_routers.delegation import (
        get_delegation_routing,
        save_model_routes,
        select_delegation_backend,
    )

    discover_plugins()
    result: dict = {"checks": {}}
    checks = result["checks"]

    routing = asyncio.run(get_delegation_routing())
    names = sorted(b["name"] for b in routing["backends"])
    result["backends"] = names
    checks["plugin_backends_listed"] = {"model_map", "profile_routes"} <= set(names)

    asyncio.run(
        save_model_routes(
            DelegationModelMapUpdate(
                options=[
                    {
                        "name": "fast",
                        "description": "quick search through documents",
                        "provider": PROVIDER,
                        "model": MODEL,
                    },
                ]
            )
        )
    )
    asyncio.run(select_delegation_backend(DelegationBackendSelect(backend="model_map")))
    routing = asyncio.run(get_delegation_routing())
    result["configured"] = routing["configured"]
    result["blocked_reason"] = routing["blocked_reason"]
    checks["backend_runs"] = (
        routing["configured"] == "model_map" and routing["blocked_reason"] is None
    )

    from hermes_cli.config import load_config
    from tools.delegate_tool_routes import resolve_task_routes

    delegation = load_config().get("delegation") or {}
    parent = SimpleNamespace(request_overrides=None, _fallback_chain=None, reasoning_config=None)
    routes, error = resolve_task_routes(
        [{"goal": "find the clause", "option": "fast"}, {"goal": "write the answer"}],
        delegation,
        parent,
    )
    result["error"] = error
    if routes:
        fast, default = routes
        result["fast"] = {
            "label": fast.label,
            "backend": fast.backend,
            "error": fast.error,
            "provider": fast.creds.get("provider"),
            "model": fast.creds.get("model"),
            "key_from_env": fast.creds.get("api_key") == FAKE_KEY,
        }
        result["default_route"] = {
            "label": default.label,
            "error": default.error,
            "provider": default.creds.get("provider"),
        }
        checks["route_uses_provider_key"] = (
            error is None
            and fast.error is None
            and fast.label == "fast"
            and fast.creds.get("model") == MODEL
            and fast.creds.get("api_key") == FAKE_KEY
        )
        checks["task_without_option_inherits"] = default.error is None and default.label is None
    else:
        checks["route_uses_provider_key"] = False

    text = (Path(os.environ["HERMES_HOME"]) / "config.yaml").read_text(encoding="utf-8")
    checks["no_key_in_config_yaml"] = (
        FAKE_KEY not in text and "api_key" not in text.split("delegation:", 1)[-1]
    )

    result["ok"] = all(checks.values())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
