"""Зонд 3I.1 (D-195): доходит ли ключ из внешнего источника секретов нашего
плагина до секретов профилей при мультиплексе — так, как это делает ядро.

Почему зонд. С двух профилей ядро 0.21.5 включает мультиплекс
(`tui_gateway/launch_profile_policy.py::activate_multi_profile_hosting`), и
`get_secret` читает только секреты профиля: `.env` профиля плюс внешние
источники. Ключи приложения живут в окружении процесса, поэтому `${env:KEY}` в
конфиге MCP остаётся строкой. План 3I — отдать их ядру источником секретов
плагина (их контракт `SecretSource`). Вопросы, на которые отвечает зонд:

1. регистрируется ли источник из настоящего плагина при их загрузке плагинов и
   перечитывает ли ядро после неё секреты главного профиля;
2. попадает ли значение в секреты профиля специалиста (routed home);
3. во что превращается `${env:KEY}` конфига MCP под привязкой профиля-владельца
   (`tools/mcp_tool_discovery.py::_owner_secret_scope`) — ключ или строка;
4. контроль: тот же путь без источника — строка (дефект воспроизводится).

Всё во временной папке, ключ ненастоящий. Запуск:
    runtime\\.hermes-venv\\Scripts\\python.exe -I runtime\\multiplex-secrets-probe.py [--no-source]
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
KEY_NAME = "AEC_PROBE_API_KEY"
KEY_VALUE = "not-a-real-key-000"
WITH_SOURCE = "--no-source" not in sys.argv

PLUGIN_YAML = """name: aec-probe-source
kind: standalone
version: "0.0.1"
description: "probe"
"""

# Тот же вид источника, что в плане 3I.2: имена — из AEC_PROVIDER_KEY_NAMES,
# значения — из окружения процесса.
PLUGIN_INIT = '''
import os
from pathlib import Path
from agent.secret_sources.base import FetchResult, SecretSource


class AecPilotSource(SecretSource):
    name = "aecpilot"
    label = "AECPilot"
    shape = "bulk"

    def fetch(self, cfg, home_path: Path) -> FetchResult:
        names = [n.strip() for n in os.environ.get("AEC_PROVIDER_KEY_NAMES", "").split(",") if n.strip()]
        return FetchResult(secrets={n: os.environ[n] for n in names if os.environ.get(n)})


def register(ctx):
    ctx.register_secret_source(AecPilotSource())
'''

CONFIG = """plugins:
  enabled:
    - aec-probe-source
"""
# Без раздела `secrets:` ядро не опрашивает внешние источники профиля вовсе
# (`hermes_cli/env_loader.py::_hydrate_profile_secret_sources`: `if not cfg:
# return {}`) — первый прогон зонда, источник был зарегистрирован, а ключа не
# было. Включение по их контракту — `secrets.<name>.enabled`.
SECRETS = """secrets:
  aecpilot:
    enabled: true
"""


def make_home(root: Path) -> tuple[Path, Path]:
    launch = root / "home"
    spec = launch / "profiles" / "spec1"
    for home in (launch, spec):
        (home / "plugins" / "aec-probe-source").mkdir(parents=True)
        (home / "plugins" / "aec-probe-source" / "plugin.yaml").write_text(PLUGIN_YAML, encoding="utf-8")
        (home / "plugins" / "aec-probe-source" / "__init__.py").write_text(PLUGIN_INIT, encoding="utf-8")
        (home / "config.yaml").write_text(CONFIG + (SECRETS if WITH_SOURCE else ""), encoding="utf-8")
    # Профиль специалиста — «настоящий» для ядра: непустой `.env` без ключа.
    (spec / ".env").write_text("AEC_PROBE_MARKER=1\n", encoding="utf-8")
    return launch, spec


def main() -> int:
    root = Path(tempfile.mkdtemp(prefix="aec-mux-probe-"))
    launch, spec = make_home(root)
    os.environ["HERMES_HOME"] = str(launch)
    os.environ[KEY_NAME] = KEY_VALUE
    if WITH_SOURCE:
        os.environ["AEC_PROVIDER_KEY_NAMES"] = KEY_NAME
    sys.path.insert(0, str(REPO / "runtime" / ".hermes-src"))

    from agent.secret_scope import build_profile_secret_scope, is_multiplex_active, reset_secret_scope, set_secret_scope
    from hermes_cli.env_loader import hydrate_profile_secret_sources
    from hermes_cli.plugins import discover_plugins
    from tools.mcp_tool_config import _interpolate_env_vars
    from tui_gateway.launch_profile_policy import activate_multi_profile_hosting_eagerly

    discover_plugins()
    from agent.secret_sources.registry import list_plugin_sources

    print(f"source: {'with' if WITH_SOURCE else 'WITHOUT'}; plugin sources: {[s.name for s in list_plugin_sources()]}")
    print(f"multiplex activated at boot: {activate_multi_profile_hosting_eagerly()} (active={is_multiplex_active()})")

    from hermes_constants import reset_hermes_home_override, set_hermes_home_override

    def routed_discovery(home: Path) -> None:
        # Как ядро для профиля специалиста: менеджер плагинов привязан к папке
        # профиля (`get_plugin_manager`), и `agent_init._load_tools` зовёт
        # `discover_plugins()` под его HERMES_HOME — источник регистрируется в
        # области этой папки, после чего ядро перечитывает её секреты.
        token = set_hermes_home_override(str(home))
        try:
            discover_plugins()
        finally:
            reset_hermes_home_override(token)

    ref = "${env:" + KEY_NAME + "}"
    for label, home in (("launch", launch), ("specialist", spec), ("spec+disc", spec)):
        if label == "spec+disc":
            routed_discovery(spec)
        hydrate_profile_secret_sources(home)
        scope = build_profile_secret_scope(home)
        token = set_secret_scope(scope, profile_home=str(home))
        try:
            resolved = _interpolate_env_vars(ref)
        finally:
            reset_secret_scope(token)
        verdict = "KEY" if resolved == KEY_VALUE else ("LITERAL" if resolved == ref else f"OTHER({len(resolved)})")
        print(f"{label:10s}: key in profile scope={scope.get(KEY_NAME) == KEY_VALUE}; MCP ${{env:}} -> {verdict}")
        if "--debug" in sys.argv:
            from agent.secret_sources.registry import apply_all, list_sources
            from hermes_cli.env_loader import _load_secrets_config
            from hermes_constants import hermes_home_key
            cfg = _load_secrets_config(home)
            print(f"   cfg={cfg}; sources for scope={[s.name for s in list_sources(scope=hermes_home_key(home))]}")
            report = apply_all(cfg, home, environ={})
            for src in report.sources:
                r = src.result
                print(f"   {src.name}: ok={r.ok} err={r.error} n={len(r.secrets)} applied={src.applied} "
                      f"skipped={getattr(src, 'skipped_existing', [])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
