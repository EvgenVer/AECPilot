"""The documents environment of the core payload (task T66, owner decision 2026-11-12).

The core's document skills (`skills/productivity/microsoft-office`, docx/xlsx/pptx/pdf)
need `python-docx`, `openpyxl`, `python-pptx`, `reportlab`, `pypdf`, `pdfplumber` and
`pypdfium2`. Upstream builds them on first use: `hermes pm environment documents --extra
documents --extra documents-pdf` resolves the core's extras from the network into a side
environment under the Hermes home. AECPilot must work without the network and must not
open the core's own interpreter to the agent (D-165), so the payload carries a separate
environment with exactly those two extras, built here at staging time:

    <payload>/docs-env/site/     the libraries (`uv pip install --target`)
    <payload>/docs-env/python    a shell launcher: the payload's bare CPython with
                                 PYTHONPATH=site — the core is not on its path

The versions are the core's: the extras' own pins from `pyproject.toml`, constrained to the
versions of the core's `uv.lock` for everything they pull in. Our gate
(`runtime/bin/hermes_gate.py`) answers that one `hermes pm environment` command with the
launcher's path, so the skill's own block finds the interpreter offline.

Standalone (into an already staged payload), from the repository root:
    runtime/core/tools/python-*/python.exe runtime/payload/docs_env.py --payload runtime/core
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1]
EXTRAS = ("documents", "documents-pdf")
# Import names the skills check (`import docx, openpyxl, pptx, reportlab, pypdf, ...`).
IMPORTS = ("docx", "openpyxl", "pptx", "reportlab", "pypdf", "pdfplumber", "pypdfium2")
FOLDER = "docs-env"

LAUNCHER = """#!/bin/sh
# AECPilot, task T66 (owner 2026-11-12): the interpreter the agent's document skills get
# from `hermes pm environment documents ...` (runtime/bin/hermes_gate.py answers it with
# this path). The payload's bare CPython — the core is not on its path (D-165) — with
# the documents libraries of ./site. Built by runtime/payload/docs_env.py.
here="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
unset PYTHONHOME
for py in "$here"/../tools/python-*/python.exe "$here"/../tools/python-*/bin/python3; do
  if [ -x "$py" ]; then
    PYTHONPATH="$here/site" PYTHONNOUSERSITE=1 exec "$py" "$@"
  fi
done
echo "AECPilot: documents environment has no interpreter next to it ($here)" >&2
exit 127
"""


def _name(requirement: str) -> str:
    return re.split(r"[\s<>=!~;\[]", requirement.strip(), maxsplit=1)[0].lower().replace("_", "-")


def requirements(project: Path) -> tuple[list[str], list[str]]:
    """(the extras' own pins, `uv.lock` versions of their whole closure as constraints)."""
    declared = tomllib.loads((project / "pyproject.toml").read_text(encoding="utf-8"))
    table = declared["project"]["optional-dependencies"]
    direct = [requirement for extra in EXTRAS for requirement in table[extra]]

    lock = tomllib.loads((project / "uv.lock").read_text(encoding="utf-8"))
    by_name: dict[str, list[dict]] = {}
    for package in lock["package"]:
        by_name.setdefault(package["name"], []).append(package)
    pending = [_name(requirement) for requirement in direct]
    seen: set[str] = set()
    constraints: list[str] = []
    while pending:
        name = pending.pop()
        if name in seen or name not in by_name:
            continue
        seen.add(name)
        entries = by_name[name]
        if len(entries) == 1:  # a forked lock entry has no single version to pin
            constraints.append(f"{name}=={entries[0]['version']}")
        for entry in entries:
            pending.extend(dependency["name"] for dependency in entry.get("dependencies", []))
    missing = sorted({_name(r) for r in direct} - seen)
    if missing:
        raise SystemExit(f"uv.lock of {project} lacks the documents extras: {missing}")
    return direct, sorted(constraints)


def payload_tools(payload: Path) -> tuple[Path, Path]:
    """(the payload's CPython, its uv)."""
    pythons = sorted(payload.glob("tools/python-*/python.exe")) or sorted(
        payload.glob("tools/python-*/bin/python3")
    )
    uvs = sorted(payload.glob("tools/uv-*/uv.exe")) or sorted(payload.glob("tools/uv-*/uv"))
    if not pythons or not uvs:
        raise SystemExit(f"{payload}: no staged python/uv under tools/")
    return pythons[-1], uvs[-1]


def folder_size(path: Path) -> int:
    return sum(file.stat().st_size for file in path.rglob("*") if file.is_file())


def build(payload: Path, project: Path, cache: Path | None = None) -> Path:
    """Build `<payload>/docs-env` from scratch; return the launcher."""
    import shutil
    import stat

    python, uv = payload_tools(payload)
    direct, constraints = requirements(project)
    out = payload / FOLDER
    if out.exists():

        def writable_then_retry(function, path, _exc):
            os.chmod(path, stat.S_IWRITE)
            function(path)

        shutil.rmtree(out, onexc=writable_then_retry)
    site = out / "site"
    site.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "requirements.txt").write_text("\n".join(direct) + "\n", encoding="utf-8")
        (Path(work) / "constraints.txt").write_text("\n".join(constraints) + "\n", encoding="utf-8")
        command = [
            str(uv),
            "pip",
            "install",
            "--no-config",
            "--quiet",
            "--python",
            str(python),
            "--target",
            str(site),
            "--link-mode",
            "copy",
            "-r",
            "requirements.txt",
            "-c",
            "constraints.txt",
        ]
        if cache is not None:
            command[3:3] = ["--cache-dir", str(cache)]
        # File names relative to `cwd`: uv splits option values at whitespace.
        subprocess.run(command, cwd=work, check=True)
    # The libraries' console scripts are of no use to the skills and name a build path.
    shutil.rmtree(site / "bin", ignore_errors=True)
    # No baked bytecode: it would add ~17 MiB to the installer for a one-time compile the
    # first time a skill imports the libraries (the install folder is the person's own).
    launcher = out / "python"
    launcher.write_bytes(LAUNCHER.encode("utf-8"))
    launcher.chmod(0o755)
    check(payload)
    return launcher


def check(payload: Path) -> None:
    """The environment imports what the skills import, and does NOT import the core."""
    python, _uv = payload_tools(payload)
    env = {
        key: value for key, value in os.environ.items() if key not in ("PYTHONHOME", "PYTHONPATH")
    }
    env.update(PYTHONPATH=str(payload / FOLDER / "site"), PYTHONNOUSERSITE="1")
    probe = (
        f"import {', '.join(IMPORTS)}\n"
        "import importlib.util as u\n"
        "assert u.find_spec('hermes_cli') is None, 'the core is importable'\n"
        "print('ok')\n"
    )
    out = subprocess.run(
        [str(python), "-B", "-c", probe],
        cwd=payload / FOLDER,  # not the caller's: stage_core runs in the core checkout
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if out.returncode != 0 or out.stdout.strip() != "ok":
        raise SystemExit(f"documents environment check failed:\n{out.stdout}{out.stderr}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--payload", default=str(RUNTIME / "core"))
    parser.add_argument("--project", default=None, help="default: <payload>/hermes-agent")
    parser.add_argument("--cache", default=str(RUNTIME / ".payload" / "uv-cache"))
    args = parser.parse_args()
    payload = Path(args.payload).resolve()
    project = Path(args.project).resolve() if args.project else payload / "hermes-agent"
    launcher = build(payload, project, Path(args.cache).resolve())
    size = folder_size(launcher.parent)
    print(f"ok {FOLDER}: {size / 1048576:.1f} MiB ({launcher})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
