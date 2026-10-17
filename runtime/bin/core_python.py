"""Run a Python script or `-c` code against the INSTALLED core payload (task T22).

The payload's dependency venv cannot be started by its own `python.exe`: its
`pyvenv.cfg` names the build machine's interpreter. Upstream's launchers instead
run the payload's standalone CPython and put the core's source tree first and the
venv's site-packages second on `sys.path`, the site dir through `site.addsitedir()`
— the only way `.pth` files run, and `pywin32.pth` is what makes `pywintypes`
importable (`scripts/build/launcher_wrapper.py`). This file does the same for our
own scripts (`memory-facts.py`, the probes), reading the paths from the payload's
`manifest.json` instead of having them minted in.

    <store python> -s core_python.py <script.py> [args...]
    <store python> -s core_python.py -c "<code>" [args...]

Development does not use it: the dev venv's interpreter finds everything itself.
"""

import json
import os
import runpy
import site
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CORE = os.path.normpath(os.path.join(HERE, os.pardir, "core"))


def configure() -> None:
    with open(os.path.join(CORE, "manifest.json"), encoding="utf-8-sig") as handle:
        runtime = json.load(handle)["runtime"]
    repo = os.path.join(CORE, *runtime["repoDir"].split("/"))
    site_dir = os.path.join(CORE, *runtime["sitePackages"].split("/"))
    # An inherited PYTHONPATH (another Python of the person's) must not shadow the
    # payload — their launchers drop it the same way.
    inherited = {os.path.normcase(os.path.abspath(entry))
                 for entry in os.environ.get("PYTHONPATH", "").split(os.pathsep) if entry}
    sys.path[:] = [entry for entry in sys.path
                   if os.path.normcase(os.path.abspath(entry or os.curdir)) not in inherited]
    site.addsitedir(site_dir)
    # Repo first: the payload's own hermes_cli wins over anything in site-packages.
    sys.path[:] = [repo] + [entry for entry in sys.path if entry != repo]


def main() -> None:
    configure()
    args = sys.argv[1:]
    if not args:
        raise SystemExit("usage: core_python.py <script.py> | -c <code> [args...]")
    if args[0] == "-c":
        sys.argv = ["-c", *args[2:]]
        exec(compile(args[1], "<string>", "exec"), {"__name__": "__main__"})
        return
    sys.argv = args
    runpy.run_path(args[0], run_name="__main__")


if __name__ == "__main__":
    main()
