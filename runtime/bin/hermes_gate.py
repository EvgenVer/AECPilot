"""OUR `hermes` for the agent's terminal: only what routines need (D-165, owner 2026-09-30).

The donor's bot routines run `hermes -p <bot> chat ...`, so `hermes` must be on the PATH
of the core's processes (D-141, task 3G.18). But the same command also changes the
core's configuration: on 30.09.2026 the agent ran `printf 'y\\n' | hermes mcp add ...`
and installed an MCP server past the consent card. So this gate lets through `chat`
(with `-p/--profile` before it) and `--version`/`--help`, and refuses everything else
with a message the agent can relay. Direct `hermes.exe ...` and `python -m hermes_cli`
are refused by the core itself (`approvals.deny`, written by the app).
"""

import os
import subprocess
import sys

REFUSAL = (
    "AECPilot: из терминала агента команда `hermes` работает только как "
    "`hermes -p <специалист> chat ...`. Настройки ядра (MCP, плагины, навыки, каналы, "
    "конфиг) меняет человек в окне приложения — назовите ему путь, а не выполняйте сами.\n"
)


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
    venv = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, ".hermes-venv")
    windows = os.path.join(venv, "Scripts", "hermes.exe")
    return os.path.normpath(
        windows if os.path.exists(windows) else os.path.join(venv, "bin", "hermes")
    )


def main() -> int:
    args = sys.argv[1:]
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
