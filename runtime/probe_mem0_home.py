"""Временный HERMES_HOME с провайдером Mem0 для python-зондов памяти (задача T20.6).

С ядра 0.22.0 Mem0 — внешний плагин: `import_provider_module("mem0", …)` находит его
только в `$HERMES_HOME/plugins/mem0/`. Без своего home зонд искал бы его в home по
умолчанию — то есть в личном Hermes человека. Здесь заводится временная папка, в
неё копируется плагин с пина (`runtime/.mem0-plugin-src`, его ставит `setup.mjs`)
тем же набором файлов, что `register-mem0-plugin.mjs`, и HERMES_HOME указывает
туда. Импортировать до первого обращения к ядру.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

PLUGIN_SRC = (
    Path(__file__).resolve().parent / ".mem0-plugin-src" / "integrations" / "hermes-plugin-mem0"
)
PLUGIN_FILES = (
    "plugin.yaml",
    "__init__.py",
    "_backend.py",
    "_openai_llm.py",
    "_oss_providers.py",
    "_setup.py",
    "LICENSE",
)


def install_plugin(home: Path) -> None:
    """Копирует плагин в `<home>/plugins/mem0` (для зонда, который заводит home сам)."""
    if not (PLUGIN_SRC / "plugin.yaml").is_file():
        raise SystemExit(f"Mem0 plugin source missing at {PLUGIN_SRC} — run node runtime/setup.mjs")
    target = Path(home) / "plugins" / "mem0"
    target.mkdir(parents=True, exist_ok=True)
    for name in PLUGIN_FILES:
        shutil.copyfile(PLUGIN_SRC / name, target / name)


def make_probe_home(prefix: str = "aec-mem0-probe-home-") -> Path:
    home = Path(tempfile.mkdtemp(prefix=prefix))
    install_plugin(home)
    os.environ["HERMES_HOME"] = str(home)
    return home
