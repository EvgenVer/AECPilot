"""Запуск сервера `aec-roster` по stdio — так его поднимает само ядро."""

from __future__ import annotations

import argparse
import sys

from aec_roster.server import build_server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aec-roster")
    parser.add_argument(
        "--roster",
        required=True,
        help="Снимок роестра, который ведёт приложение (см. aec_roster.roster)",
    )
    parser.add_argument(
        "--hermes",
        required=True,
        help="Исполняемый файл ядра: разговор идёт его командой, а не через шлюз",
    )
    args = parser.parse_args(argv)

    if not args.hermes.strip():
        print("aec-roster: --hermes пустой", file=sys.stderr)
        return 1

    build_server(args.roster, args.hermes).run("stdio")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
