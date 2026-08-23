"""Один разговор со специалистом за раз (задача 3C.7)."""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path

import pytest
from aec_roster.ask import AskError
from aec_roster.runner import ASK_TIMEOUT_SECONDS, busy


def lock_of(profile: str) -> Path:
    return Path(tempfile.gettempdir()) / f"aec-roster-{profile}.lock"


def test_second_question_to_a_busy_specialist_is_refused_with_words() -> None:
    with busy("занятой"):
        with pytest.raises(AskError) as failure:
            with busy("занятой"):
                pass

    assert "отвечает" in str(failure.value)


def test_the_lock_is_released_even_when_the_talk_fails() -> None:
    with pytest.raises(RuntimeError):
        with busy("упавший"):
            raise RuntimeError("ход не удался")

    assert not lock_of("упавший").exists()

    with busy("упавший"):
        pass


def test_a_lock_older_than_the_talk_itself_belongs_to_a_dead_process() -> None:
    stale = lock_of("мёртвый")
    stale.write_text("", encoding="utf-8")
    old = time.time() - ASK_TIMEOUT_SECONDS - 60
    os.utime(stale, (old, old))

    with busy("мёртвый"):
        pass

    assert not stale.exists()
