"""Задача T59: просьба к Windows о полной скорости доходит и ничего не роняет."""

from __future__ import annotations

import sys

import pytest
from aec_secret_filter import full_speed

# `GetProcessInformation` отдаёт то, что поставили: маска и состояние отказа.
CHECK = """
import ctypes, sys
from ctypes import wintypes
sys.path.insert(0, sys.argv[1])
from aec_secret_filter.full_speed import ask_full_speed
class State(ctypes.Structure):
    _fields_ = [("v", wintypes.ULONG), ("c", wintypes.ULONG), ("s", wintypes.ULONG)]
accepted = ask_full_speed()
kernel = ctypes.WinDLL("kernel32")
kernel.GetCurrentProcess.restype = wintypes.HANDLE
kernel.GetProcessInformation.argtypes = [
    wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD
]
state = State(1, 0, 0)
kernel.GetProcessInformation(
    kernel.GetCurrentProcess(), 4, ctypes.byref(state), ctypes.sizeof(state)
)
print(accepted, state.c, state.s)
"""


@pytest.mark.skipif(sys.platform != "win32", reason="Windows")
def test_windows_accepts_and_keeps_it() -> None:
    import subprocess
    from pathlib import Path

    out = subprocess.run(
        [sys.executable, "-c", CHECK, str(Path(full_speed.__file__).parents[1])],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    ).stdout.split()
    assert out[:3] == ["True", "1", "0"]


def test_elsewhere_it_is_a_quiet_no(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "platform", "linux")
    assert full_speed.ask_full_speed() is False
