"""Prints what the core's own discovery sees for HERMES_HOME (task T50 probe helper).

One JSON line: the gateway state (`absent`, `starting`, `ready`, ...), its reason code,
and the hosted-room tables of the two stores a room can live in: the root
`shared-state.db` (standalone `hermes serve`) and `state.db` (the gateway's session
store). Read-only.
"""

import json
import os
import sqlite3
from pathlib import Path

from hermes_cli.gateway_runtime import discover_gateway_endpoint

home = Path(os.environ["HERMES_HOME"])
discovery = discover_gateway_endpoint(home, timeout=5)


WANTED = ("room_id", "name", "authority_gateway_id", "disbanded_at")


def rooms(db: Path):
    if not db.is_file():
        return None
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        found = {}
        for table in sorted(t for t in tables if "room" in t):
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
            pick = [c for c in WANTED if c in cols]
            if "room_id" not in pick:
                found[table] = f"{len(cols)} cols"
                continue
            select = f"SELECT {', '.join(pick)} FROM {table}"
            found[table] = [dict(zip(pick, row, strict=True)) for row in conn.execute(select)]
        return found
    finally:
        conn.close()


print(
    json.dumps(
        {
            "state": discovery.state,
            "reason": getattr(discovery, "reason_code", None),
            "api_origin": discovery.endpoint.api_origin if discovery.endpoint else None,
            "supervisor": discovery.endpoint.supervisor if discovery.endpoint else None,
            "shared_state": rooms(home / "shared-state.db"),
            "state_db": rooms(home / "state.db"),
        },
        ensure_ascii=False,
        default=str,
    )
)
