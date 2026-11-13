"""OUR `hermes` for the agent's terminal: only what routines need (D-165, owner 2026-09-30).

The donor's bot routines run `hermes -p <bot> chat ...`, so `hermes` must be on the PATH
of the core's processes (D-141, task 3G.18). But the same command also changes the
core's configuration: on 30.09.2026 the agent ran `printf 'y\\n' | hermes mcp add ...`
and installed an MCP server past the consent card. So this gate lets through `chat`
(with `-p/--profile` before it) and `--version`/`--help`, and refuses everything else
with a message the agent can relay. Direct `hermes.exe ...` and `python -m hermes_cli`
are refused by the core itself (`approvals.deny`, written by the app).

One more command is answered here, without the core (task T66, owner 2026-11-12): the
document skills ask `hermes pm environment documents --extra documents --extra
documents-pdf` for their interpreter, and upstream builds it from the network. The payload
carries that environment already (`runtime/payload/docs_env.py`), so the gate prints its
launcher — a bare interpreter, the core is not on its path — and nothing else of `pm`.
"""

import os
import subprocess
import sys

REFUSAL = (
    "AECPilot: из терминала агента команда `hermes` работает только как "
    "`hermes -p <специалист> chat ...`. Настройки ядра (MCP, плагины, навыки, каналы, "
    "конфиг) меняет человек в окне приложения — назовите ему путь, а не выполняйте сами.\n"
)

DOCS_COMMAND = [
    "pm",
    "environment",
    "documents",
    "--extra",
    "documents",
    "--extra",
    "documents-pdf",
]
DOCS_MISSING = (
    "AECPilot: окружение библиотек документов не установлено (нет runtime/core/docs-env). "
    "Переустановите приложение или, в разработке, выполните `node runtime/setup.mjs`.\n"
)


def runtime_dir() -> str:
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))


def docs_request(args: list[str]) -> bool:
    """Exactly the skills' command: the two extras in either order, nothing else."""
    if args[:3] != DOCS_COMMAND[:3] or len(args) != len(DOCS_COMMAND):
        return False
    rest = args[3:]
    return rest[0::2] == ["--extra", "--extra"] and sorted(rest[1::2]) == sorted(
        ["documents", "documents-pdf"]
    )


def docs_python() -> str | None:
    """The documents environment's launcher, forward slashes (bash runs it on Windows)."""
    launcher = os.path.join(runtime_dir(), "core", "docs-env", "python")
    return launcher.replace("\\", "/") if os.path.isfile(launcher) else None


def allowed(args: list[str]) -> bool:
    index = 0
    while index < len(args):
        arg = args[index]
        if arg in ("-p", "--profile"):
            index += 2
            continue
        if arg.startswith("--profile="):
            index += 1
            continue
        if arg in ("--version", "-V", "version", "--help", "-h"):
            return True
        return arg == "chat"
    return False


def core_binary() -> str:
    runtime = runtime_dir()
    # The staged core payload (installed tree, or a working copy after setup.mjs,
    # task T21.2): its launcher, as its manifest names it.
    manifest = os.path.join(runtime, "core", "manifest.json")
    if os.path.exists(manifest):
        import json

        with open(manifest, encoding="utf-8-sig") as handle:
            relative = json.load(handle)["runtime"]["commands"]["hermes"]
        return os.path.normpath(os.path.join(runtime, "core", *relative.split("/")))
    venv = os.path.join(runtime, ".hermes-venv")
    windows = os.path.join(venv, "Scripts", "hermes.exe")
    return os.path.normpath(
        windows if os.path.exists(windows) else os.path.join(venv, "bin", "hermes")
    )


def main() -> int:
    args = sys.argv[1:]
    if docs_request(args):
        launcher = docs_python()
        if launcher is None:
            sys.stderr.buffer.write(DOCS_MISSING.encode("utf-8"))
            sys.stderr.flush()
            return 1
        sys.stdout.write(launcher + "\n")
        sys.stdout.flush()
        return 0
    if not allowed(args):
        # UTF-8 bytes: the core's terminal decodes output as UTF-8, a Windows console
        # codepage would turn the Russian text into mojibake for the agent.
        sys.stderr.buffer.write(REFUSAL.encode("utf-8"))
        sys.stderr.flush()
        return 2
    if (
        "chat" in args
        and ("-c" in args or "--continue" in args)
        and "--create-if-missing" not in args
    ):
        args.append("--create-if-missing")
    return subprocess.call([core_binary(), *args])


if __name__ == "__main__":
    sys.exit(main())
