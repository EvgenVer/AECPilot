"""D-171 (3G.39): удалённый факт не должен вернуться из журнала реплик Mem0."""

from __future__ import annotations

import sqlite3
import threading

from aec_secret_filter.mem0_turns import forget_scope_turns

MINE = "agent_id=hermes&user_id=project-aaaa"


class FakeDb:
    """Та же таблица и тот же замок, что у их `SQLiteManager` (mem0 2.x)."""

    def __init__(self) -> None:
        self.connection = sqlite3.connect(":memory:", check_same_thread=False)
        self._lock = threading.Lock()
        self.connection.execute(
            "CREATE TABLE messages (id TEXT PRIMARY KEY, session_scope TEXT, role TEXT,"
            " content TEXT, name TEXT, created_at DATETIME)"
        )

    def add(self, scope: str, content: str) -> None:
        count = self.connection.execute("SELECT count(*) FROM messages").fetchone()[0]
        self.connection.execute(
            "INSERT INTO messages VALUES (?, ?, 'user', ?, NULL, '2026-09-30')",
            (str(count), scope, content),
        )
        # Их запись всегда закрывает свою транзакцию (`BEGIN`/`COMMIT`).
        self.connection.commit()

    def contents(self) -> list[str]:
        return [
            row[0] for row in self.connection.execute("SELECT content FROM messages ORDER BY id")
        ]


class FakeMemory:
    def __init__(self, db: FakeDb | None) -> None:
        self.db = db


def test_forgets_only_this_project() -> None:
    db = FakeDb()
    db.add(MINE, "Запомни: резерв мощности 20 %")
    db.add("user_id=project-aaaa", "своё без агента")
    db.add("agent_id=hermes&user_id=project-aaaa2", "чужой проект с похожим ключом")
    db.add("agent_id=hermes&user_id=project-bbbb", "чужой проект")

    assert forget_scope_turns(FakeMemory(db), "project-aaaa") == 2
    assert db.contents() == ["чужой проект с похожим ключом", "чужой проект"]


def test_nothing_to_forget() -> None:
    db = FakeDb()
    db.add("agent_id=hermes&user_id=project-bbbb", "чужой проект")

    assert forget_scope_turns(FakeMemory(db), "project-aaaa") == 0
    assert db.contents() == ["чужой проект"]


def test_without_store_or_key_does_nothing() -> None:
    assert forget_scope_turns(FakeMemory(None), "project-aaaa") == 0
    assert forget_scope_turns(None, "project-aaaa") == 0
    assert forget_scope_turns(FakeMemory(FakeDb()), "") == 0
