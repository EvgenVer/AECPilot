"""Пакет фильтра лежит рядом, а не ставится в venv — и на то есть причина.

Эта папка обязана оставаться самодостаточным ПЛАГИНОМ ЯДРА: её целиком копируют
в `$HERMES_HOME/plugins/aec-secret-filter/`, где `pip install` никто не делает,
а `plugin.yaml` и `__init__.py` лежат рядом. Поэтому импорт для тестов
добирается до неё путём, а не установкой.
"""

from __future__ import annotations

import sys
from pathlib import Path

PLUGINS_DIR = Path(__file__).resolve().parents[2]

if str(PLUGINS_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGINS_DIR))
