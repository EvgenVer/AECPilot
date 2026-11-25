"""Полная скорость процессора для процесса ядра (задача T59, замер T58).

Процесс без окна Windows 11 считает фоновым и переводит на энергосберегающие ядра
процессора: распознавание одной фразы вместо 8-10 с шло 20-30 с (`eval/reports/dictation.md`).
`SetProcessInformation` с `ProcessPowerThrottling` — штатный для Windows отказ от этого
режима. Приоритет процесса не меняется: другим программам ядро не мешает больше прежнего.
"""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)

_PROCESS_POWER_THROTTLING = 4
_THROTTLING_VERSION = 1
_EXECUTION_SPEED = 0x1


def ask_full_speed() -> bool:
    """`True` — Windows приняла просьбу. Вне Windows и при отказе — `False`, без ошибки."""
    if sys.platform != "win32":
        return False
    import ctypes
    from ctypes import wintypes

    class ThrottlingState(ctypes.Structure):
        _fields_ = [
            ("Version", wintypes.ULONG),
            ("ControlMask", wintypes.ULONG),
            ("StateMask", wintypes.ULONG),
        ]

    try:
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        kernel.SetProcessInformation.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            ctypes.c_void_p,
            wintypes.DWORD,
        ]
        kernel.SetProcessInformation.restype = wintypes.BOOL
        # Маска названа, состояние нулевое: «экономию скорости к этому процессу не применять».
        state = ThrottlingState(_THROTTLING_VERSION, _EXECUTION_SPEED, 0)
        accepted = kernel.SetProcessInformation(
            kernel.GetCurrentProcess(),
            _PROCESS_POWER_THROTTLING,
            ctypes.byref(state),
            ctypes.sizeof(state),
        )
        if not accepted:
            logger.info("aec-secret-filter: полная скорость: отказ %s", ctypes.get_last_error())
        return bool(accepted)
    except Exception as error:
        logger.info("aec-secret-filter: полная скорость не запрошена (%s)", error)
        return False
