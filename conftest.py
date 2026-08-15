"""Repository-wide pytest setup.

Bridges the provider key into the test process. In production the desktop app
keeps the key in safeStorage and injects it into this server's spawn
environment (PLAN rule R2); tests run outside the app, so a key already present
in the environment wins, and otherwise the hermes dev profile's `.env` — the
same file the app's own settings screen checks — is read as a fallback.

Only the one variable is taken, and only when it is not already set. Nothing
here prints, logs, or copies the value anywhere.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_ENV_VAR = "OPENAI_API_KEY"
_DEV_PROFILE_ENV = Path(__file__).parent / "runtime" / "dev-profile" / ".env"
_ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def _load_dev_profile_key() -> None:
    if os.environ.get(_ENV_VAR) or not _DEV_PROFILE_ENV.is_file():
        return
    for line in _DEV_PROFILE_ENV.read_text(encoding="utf-8").splitlines():
        match = _ASSIGNMENT.match(line)
        if match is not None and match.group(1) == _ENV_VAR:
            os.environ[_ENV_VAR] = match.group(2).strip().strip("\"'")
            return


_load_dev_profile_key()
