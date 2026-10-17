"""Stage the core runtime payload for the installer (task T21/T22, SPEC UR40).

The core ships the way upstream ships its own desktop bundle: their PM builds a
contained payload — the pinned CPython, a relocatable dependency tree, the pinned
tools, PM's own runtime and a uv cache for offline plugin rebuilds — and their
assembler writes the launchers and `manifest.json`. We call THEIR builder
(`scripts/bundles/native.py`) piece by piece instead of `hermes pm bundle`, for
two differences only, both decided by the owner:

* **Tools.** `pm bundle` stages every non-internal tool of their lock. We stage
  the ones the product uses (`TOOLS`) and leave out what SPEC excludes: `bws`
  (password vault, HX24), `cua-driver` (computer use, UR15 — post-MVP),
  `whispercpp-cpu` (voice, HX19), `gh` (developer skills are off, UR42) and the
  `llamacpp-*` builds (local models are downloaded on the person's explicit
  action, UR39 — not shipped).
  `ffmpeg` stays out too: the core uses it only for voice and text-to-speech,
  both removed (HX19), and the pinned build is the GPL one (SPEC N8). Git for
  Windows ships although it is GPLv2: the core runs every terminal command
  through its bash on Windows (`tools/environments/local.py::_find_bash`), and
  checkpoints (UR14) live in git — an unmodified separate program, the one
  exception SPEC C3 makes (owner decision 2026-10-16).
* **Extras.** `pm bundle` builds with `--all-extras`; we build the extras our
  setup has always installed (`EXTRAS`, same as `runtime/setup.mjs`).
* **Mem0.** The memory provider plugin's requirements go into the same
  environment in one resolution with the core lock, exactly as `setup.mjs`
  does in development (`mem0-plugin-requirements.txt`, task T20.3).
* **`pillow-heif`** is removed from the environment and from the shipped uv
  cache: its Windows wheel is GPLv2 (SPEC C3, owner decision 2026-09-15).

Nothing of the core's code is edited: the snapshot is `git archive` of the pinned
commit in `runtime/.hermes-src` (SPEC C1). One data file of the payload is: the
tools we leave out are dropped from the payload's `pm/lock.json`, so their PM's own
verdict on the finished payload is clean (`settle_core.py`, task T21.2). And one file
is added: `bin/hermes`, a shell script that hands the agent's `hermes` commands to
our gate (`gate_launcher()`).

Usage (from the repository root, with the core venv's Python — any 3.11+ works,
PM bootstraps its own):
    runtime/.hermes-venv/Scripts/python.exe runtime/payload/stage_core.py --out runtime/core
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1]
CORE_SRC = RUNTIME / ".hermes-src"

# Tool closure we ship. PM adds the dependencies (`uv` -> `python`,
# `agent-browser` -> `node`, ...) itself through `walk()`.
TOOLS = ("python", "uv", "node", "npm", "git", "ripgrep", "agent-browser", "chromium")
EXTRAS = ("mcp", "ddgs")
MEM0_REQUIREMENTS = RUNTIME / "mem0-plugin-requirements.txt"
EXCLUDED_PACKAGES = ("pillow-heif",)


def _uv(store_dir: Path, facts) -> Path:
    from pm.registry import get_package
    from pm.store import current_target

    return get_package("uv").binary(store_dir / facts.get("uv")["entry"], current_target())


def add_mem0_and_exclusions(repo_dir: Path, venv_dir: Path, uv: Path) -> None:
    """Mem0's requirements constrained to the core lock, then the exclusions."""
    import shutil

    python = venv_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    work = venv_dir.parent
    constraints = work / "core-constraints.txt"
    requirements = work / "mem0-requirements.txt"
    subprocess.run(
        [
            str(uv),
            "export",
            "--frozen",
            "--no-dev",
            "--no-hashes",
            "--no-emit-project",
            "--quiet",
            *[arg for extra in EXTRAS for arg in ("--extra", extra)],
            "--output-file",
            str(constraints),
        ],
        cwd=repo_dir,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    shutil.copyfile(MEM0_REQUIREMENTS, requirements)
    try:
        # File names relative to `cwd`: uv splits these option values at whitespace, and
        # the repository lives under `D:\my program\…` (measured, task 3.B5 — setup.mjs).
        subprocess.run(
            [
                str(uv),
                "pip",
                "install",
                "--python",
                str(python),
                "--constraint",
                constraints.name,
                "-r",
                requirements.name,
            ],
            cwd=work,
            check=True,
        )
    finally:
        constraints.unlink(missing_ok=True)
        requirements.unlink(missing_ok=True)
    subprocess.run(
        [str(uv), "pip", "uninstall", "--python", str(python), *EXCLUDED_PACKAGES], check=True
    )


def drop_excluded_from_cache(cache: Path) -> int:
    """Remove every cached wheel and unpacked archive of an excluded package."""
    import shutil

    names = {name.replace("-", "_").lower() for name in EXCLUDED_PACKAGES}
    removed = 0
    for path in sorted(cache.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if not path.exists() or not path.is_dir():
            continue
        if path.name.replace("-", "_").lower() in names or path.name.lower().startswith(
            tuple(f"{name}-" for name in names)
        ):
            # An unpacked archive is `archive-vN/<hash>/<package dir>`: drop the whole entry.
            owner = path.parent if path.parent.parent.name.startswith("archive-v") else path
            shutil.rmtree(owner, ignore_errors=True)
            removed += 1
    return removed


def _isolated_env(out: Path, cache: Path) -> tuple[dict, tempfile.TemporaryDirectory]:
    """The same isolation their `stage_native` gives the build: HOME, HERMES_HOME and
    caches inside the build dir, so nothing lands in the developer's profile."""
    work = tempfile.TemporaryDirectory(prefix=".build-", dir=out)
    env = {
        **os.environ,
        "HOME": work.name,
        "USERPROFILE": work.name,
        "HERMES_HOME": str(Path(work.name) / ".hermes"),
        "HERMES_RUNTIME_DIR": str(out / "tools"),
        "HERMES_PYTHON_SRC_ROOT": str(CORE_SRC),
        "XDG_CACHE_HOME": str(Path(work.name) / "cache"),
        "XDG_CONFIG_HOME": str(Path(work.name) / "config"),
        "UV_CACHE_DIR": str(cache),
        "PYTHONPATH": str(CORE_SRC),
    }
    for key, directory in (("CARGO_HOME", ".cargo"), ("RUSTUP_HOME", ".rustup")):
        env.setdefault(key, str(Path.home() / directory))
    return env, work


def prepare(out: Path, cache: Path, ref: str) -> Path:
    """`scripts/bundles/native.py::_prepare_native` with our tool list and extras."""
    from pm import build_environment, paths, prepare_tools
    from pm.features import installed_extras, write_features
    from pm.lock import Facts
    from pm.package import InstallError
    from pm.packages import Venv
    from pm.registry import get_package
    from pm.store import current_target
    from pm.uv_cache_prune import prune_uv_cache_to_lock
    from scripts.build.inputs import RESOURCE_ENV, AgentInputs, dependency_site
    from scripts.bundles.bytecode import bake_bytecode
    from scripts.bundles.native import (
        _arch_guard,
        prune_staged_store,
        stage_pm_runtime,
        stage_uv_cache,
    )
    from scripts.bundles.native_prepared import publish_prepared
    from scripts.bundles.payload import (
        INERT_SNAPSHOT_DIRS,
        record_tools,
        relativize_links,
        snapshot,
    )

    target = current_target()
    store_dir = out / "tools"
    store_dir.mkdir(parents=True, exist_ok=True)
    repo_dir = out / "hermes-agent"
    print(f"staging repo snapshot ({ref})", flush=True)
    revision = subprocess.check_output(
        ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
        cwd=CORE_SRC,
        text=True,
        encoding="utf-8",
    ).strip()
    snapshot(CORE_SRC, revision, repo_dir, exclude=INERT_SNAPSHOT_DIRS)
    if (repo_dir / "pm/lock.json").read_bytes() != paths.lockfile_path().read_bytes():
        raise ValueError("the snapshot's PM lock differs from the builder's")

    names = [n for n in TOOLS if get_package(n).missing_reason(target) is None]
    missing = sorted(set(TOOLS) - set(names))
    if missing:
        raise InstallError("tools", f"not available for {target}: {missing}")
    prepare_tools(names, out=store_dir, target=target, cache=cache)
    prune_staged_store(store_dir, names)

    facts = Facts(store_dir / "facts.json")
    python_fact = facts.get("python")
    python_bin = get_package("python").binary(store_dir / python_fact["entry"], target)
    stage_pm_runtime(out, python_bin, repo_dir, cache=cache)
    print("ok pm-runtime", flush=True)

    venv_dir = out / "venv"
    build_environment(
        source=repo_dir,
        python=python_bin,
        out=venv_dir,
        env=dict(os.environ),
        cache=cache,
        extras=list(EXTRAS),
        sealed=True,
        explicit=True,
        timeout=2 * 60 * 60,
    )
    print(f"ok venv (extras: {', '.join(EXTRAS)})", flush=True)
    add_mem0_and_exclusions(repo_dir, venv_dir, _uv(store_dir, facts))
    print("ok mem0 requirements; excluded: " + ", ".join(EXCLUDED_PACKAGES), flush=True)

    features = installed_extras(repo_dir, venv_dir, python_exe=python_bin)
    write_features(features, out)
    facts.record_state("venv", Venv(repo_dir).expected_stamp(features, plugin_dirs=[]), features)

    payload_cache = out / "uv-cache"
    stage_uv_cache(cache, payload_cache)
    pruned = prune_uv_cache_to_lock(payload_cache, repo_dir)
    dropped = drop_excluded_from_cache(payload_cache)
    print(f"ok uv-cache (pruned {pruned}, excluded entries {dropped})", flush=True)

    bad = _arch_guard(store_dir)
    if bad:
        raise InstallError("tools", "; ".join(bad))
    recorded = {
        name: fact["entry"] for name in names if (fact := facts.get(name)) and "entry" in fact
    }
    record_tools(out, paths.lockfile_path(), target, recorded)
    site = dependency_site(venv_dir, python_fact["version"], target)
    (site / "hermes-agent.pth").write_text(
        Path(os.path.relpath(repo_dir, site)).as_posix() + "\n", encoding="utf-8"
    )
    relativize_links(out)
    baked = bake_bytecode(out, python_bin)
    print(f"ok bytecode ({baked['modules']} modules)", flush=True)
    inputs = AgentInputs(
        project=repo_dir / "pyproject.toml",
        code=repo_dir,
        repo="hermes-agent",
        placement="contained",
        target=target,
        python=python_bin,
        site_packages=site,
        environment=venv_dir,
        tools=store_dir,
        pm_runtime=out / "pm-runtime",
        ref=ref,
        resources={name: repo_dir / name for name in RESOURCE_ENV},
        features=out / "enabled-features.json",
    )
    return publish_prepared(out, CORE_SRC, revision, inputs)


def clear_previous(out: Path) -> None:
    """A rebuild starts clean except for `tools/` (the pinned downloads, reused by PM).
    The previous run sealed its bytecode read-only, so removal clears the flag first."""
    import shutil
    import stat

    def writable_then_retry(function, path, _exc):
        os.chmod(path, stat.S_IWRITE)
        function(path)

    for entry in out.iterdir():
        if entry.name in ("tools",) or entry.name.startswith(".build-"):
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry, onexc=writable_then_retry)
        else:
            entry.unlink()


def child(args) -> int:
    from scripts.bundles.native import finish_native
    from scripts.bundles.native_prepared import preparation_lock, prepared_path

    out = Path(args.out).absolute()
    with preparation_lock(out):
        prepared_path(out).unlink(missing_ok=True)
        (out / "manifest.json").unlink(missing_ok=True)
        prepared = prepare(out, Path(args.cache).resolve(), args.ref)
    code = finish_native(prepared, {})
    if code:
        return code
    gate_launcher(out)
    return settle(out)


GATE_LAUNCHER = """#!/bin/sh
# AECPilot, task T21.2 (D-165): the agent's terminal reaches our gate, not this launcher.
# In a payload the core puts THIS folder first on the terminal's PATH
# (tools/environments/local.py::_prepend_hermes_bin_dir), ahead of runtime/bin, so the
# gate that keeps the agent from `hermes mcp add` was bypassed (measured 2026-10-17,
# acceptance 29.5). bash finds this script before hermes.exe; the core's own Python
# children resolve hermes.exe through PATHEXT — the payload's own launcher, our pinned
# core, which is all D-141 asks of them.
exec "$(dirname "$0")/../../bin/hermes" "$@"
"""


def gate_launcher(out: Path) -> Path:
    """`<payload>/bin/hermes` -> `runtime/bin/hermes` (the payload sits at `runtime/core`)."""
    script = out / "bin" / "hermes"
    script.write_bytes(GATE_LAUNCHER.encode("utf-8"))
    script.chmod(0o755)
    return script


def settle(out: Path) -> int:
    """Their PM's verdict on the finished payload, on the payload's own interpreter."""
    import json

    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8-sig"))
    python = out / manifest["runtime"]["storePython"]
    script = Path(__file__).resolve().with_name("settle_core.py")
    return subprocess.run([str(python), "-I", str(script), str(out)]).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True)
    parser.add_argument("--cache", default=str(RUNTIME / ".payload" / "uv-cache"))
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.child:
        sys.path.insert(0, str(CORE_SRC))
        return child(args)
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_previous(out)
    cache = Path(args.cache).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    env, work = _isolated_env(out, cache)
    with work:
        command = [
            sys.executable,
            "-B",
            str(Path(__file__).resolve()),
            "--child",
            "--out",
            str(out),
            "--cache",
            str(cache),
            "--ref",
            args.ref,
        ]
        return subprocess.run(command, cwd=CORE_SRC, env=env, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
