"""What the index costs to hold and to query (task 2.18).

docs/plan-details.md §Architecture chose NanoVectorDB with a review point attached: embedded
stores have limits (R3), and the decision to stay or to move to our own
sqlite-vec layer is to be made on numbers, not on preference. This produces the
numbers.

It measures **all three** of LightRAG's stores, because in an embedded
configuration it is not only the vectors that live in memory: the KV stores are
JSON files read whole, and the graph is NetworkX. Measuring vectors alone would
answer a question nobody asked.

    uv run python eval/load_check.py            # measure what is indexed now
    uv run python eval/load_check.py --scale 2  # …and project to twice that
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "eval"))

from graph_cost import load_env_file  # noqa: E402

VAULT = REPO_ROOT / "eval" / ".eval-vault"
DEFAULT_ENV_FILE = REPO_ROOT / "runtime" / "dev-profile" / ".env"

QUERIES = [
    "установленная мощность",
    "класс бетона фундаментной плиты",
    "скорость воздуха в вытяжных системах",
    "категория надёжности электроснабжения",
    "количество машиномест",
]


class _MemoryCounters(ctypes.Structure):
    _fields_ = [
        ("cb", ctypes.c_ulong),
        ("PageFaultCount", ctypes.c_ulong),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]


def resident_mb() -> float:
    """Resident set of this process, in MiB.

    Read from the OS rather than from `tracemalloc`: the vectors are numpy
    arrays, and numpy allocates outside the Python allocator — the tracer would
    miss exactly the thing being measured.
    """
    if os.name != "nt":  # pragma: no cover — the dev target is Windows
        import resource

        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

    counters = _MemoryCounters()
    counters.cb = ctypes.sizeof(_MemoryCounters)
    # The return type has to be declared: ctypes defaults to `int`, which
    # truncates a 64-bit handle and makes every call fail for no visible reason.
    ctypes.windll.kernel32.GetCurrentProcess.restype = ctypes.c_void_p
    handle = ctypes.windll.kernel32.GetCurrentProcess()
    # `K32GetProcessMemoryInfo` lives in kernel32 on everything since Windows 7;
    # the psapi.dll export is the older name and is not always resolvable.
    for library, name in (
        (ctypes.windll.kernel32, "K32GetProcessMemoryInfo"),
        (ctypes.windll.psapi, "GetProcessMemoryInfo"),
    ):
        function = getattr(library, name, None)
        if function is None:
            continue
        function.argtypes = [ctypes.c_void_p, ctypes.POINTER(_MemoryCounters), ctypes.c_ulong]
        if function(handle, ctypes.byref(counters), counters.cb):
            return counters.WorkingSetSize / 1048576
    raise RuntimeError("не удалось прочитать потребление памяти процессом")


def store_sizes() -> dict[str, Any]:
    """Every file of the index, grouped by which of the three stores it is."""
    directory = VAULT / ".aecpilot" / "lightrag"
    groups = {"vectors": 0, "kv": 0, "graph": 0, "other": 0}
    files: dict[str, float] = {}
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        size = path.stat().st_size
        files[path.name] = round(size / 1048576, 2)
        name = path.name
        if name.startswith("vdb_"):
            groups["vectors"] += size
        elif name.startswith("kv_store_"):
            groups["kv"] += size
        elif name.endswith(".graphml"):
            groups["graph"] += size
        else:
            groups["other"] += size

    index_db = (VAULT / ".aecpilot" / "index.db").stat().st_size
    return {
        "by_store_mb": {key: round(value / 1048576, 2) for key, value in groups.items()},
        "index_db_mb": round(index_db / 1048576, 2),
        "files_mb": files,
    }


def index_contents() -> dict[str, int]:
    conn = sqlite3.connect(VAULT / ".aecpilot" / "index.db")
    try:
        return {
            "documents": conn.execute("SELECT count(*) FROM ingested_files").fetchone()[0],
            "chunks": conn.execute("SELECT count(*) FROM chunks").fetchone()[0],
            "characters": conn.execute(
                "SELECT coalesce(sum(length(text)), 0) FROM chunks"
            ).fetchone()[0],
        }
    finally:
        conn.close()


async def measure(args) -> dict[str, Any]:
    from aec_rag.db import open_index as open_db
    from aec_rag.rag_index import load_settings, open_index
    from aec_rag.server import search_chunks

    contents = index_contents()
    sizes = store_sizes()

    baseline_mb = resident_mb()
    opened_at = time.monotonic()
    settings = load_settings(VAULT / ".aecpilot" / "project.json")
    rag = await open_index(VAULT, settings)
    conn = open_db(VAULT / ".aecpilot" / "index.db")
    open_seconds = time.monotonic() - opened_at
    loaded_mb = resident_mb()

    latencies: list[float] = []
    hits: list[int] = []
    try:
        for query in QUERIES:
            started = time.monotonic()
            found = await search_chunks(conn, rag, query, top_k=10)
            latencies.append(time.monotonic() - started)
            hits.append(len(found))
    finally:
        conn.close()
    queried_mb = resident_mb()

    scale = args.scale
    return {
        "contents": contents,
        "storage": sizes,
        "open_seconds": round(open_seconds, 1),
        "memory_mb": {
            "before_open": round(baseline_mb, 1),
            "after_open": round(loaded_mb, 1),
            "after_queries": round(queried_mb, 1),
            "index_cost": round(queried_mb - baseline_mb, 1),
        },
        "query_seconds": {
            "median": round(sorted(latencies)[len(latencies) // 2], 2),
            "max": round(max(latencies), 2),
            "hits": hits,
        },
        "projection": {
            "scale": scale,
            "chunks": contents["chunks"] * scale,
            "storage_mb": round(
                sum(sizes["by_store_mb"].values()) * scale + sizes["index_db_mb"] * scale, 1
            ),
            "index_cost_mb": round((queried_mb - baseline_mb) * scale, 1),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="load_check")
    parser.add_argument("--scale", type=int, default=2, help="Во сколько раз проецировать")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--out", help="Куда записать отчёт машиночитаемо")
    args = parser.parse_args(argv)

    if not (VAULT / ".aecpilot" / "index.db").is_file():
        print("load_check: нет индекса — сначала `eval/ingest_samples.py`", file=sys.stderr)
        return 1

    load_env_file(Path(args.env_file))
    report = asyncio.run(measure(args))
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
