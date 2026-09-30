"""Забыть журнал реплик проекта в Mem0 при удалении факта (D-171, задача 3G.39).

ЗАМЕРЕНО 2026-09-30 (профиль красного прогона спеки 42): удалённый в окне памяти
факт возвращался новым — «User stated that the power reserve at the facility is
20 %» — через 27 с после удаления, в новом сеансе. Их `Memory.add(infer=True)`
подмешивает к извлечению последние 10 реплик области
(`mem0/memory/main.py`, `get_last_messages(session_scope, limit=10)`), а сами
реплики лежат в таблице `messages` их `history.db`. Удаление факта её не трогает:
реплика «Запомни: резерв мощности 20 %» оставалась, и следующее извлечение
снова находило в ней факт. Новый сеанс не помогает — область это проект, а не
сеанс.

ПОЭТОМУ ЗДЕСЬ ПРАВКА ИХ ВНУТРЕННЕЙ ТАБЛИЦЫ: другого пути у mem0 нет, кроме
`reset()` всего хранилища. Берутся их же соединение и замок, чтобы не разойтись
с их записью. Форма области (`agent_id=…&user_id=…`) и схема таблицы — факты их
кода по пину: страж `runtime/mem0-turns-contract.test.mjs` падает при подъёме,
если они сменились. Цена решения владельца: следующее извлечение не видит
недавнего разговора этого проекта.
"""

from __future__ import annotations

from typing import Any


def forget_scope_turns(memory: Any, user_id: str) -> int:
    """Удаляет реплики всех областей, где `user_id` — этот проект. Возвращает
    число удалённых реплик; без хранилища или ключа не делает ничего."""
    db = getattr(memory, "db", None)
    connection = getattr(db, "connection", None)
    lock = getattr(db, "_lock", None)
    if connection is None or lock is None or not user_id:
        return 0
    part = "user_id=" + user_id
    with lock:
        scopes = [
            row[0] for row in connection.execute("SELECT DISTINCT session_scope FROM messages")
        ]
        mine = [scope for scope in scopes if part in (scope or "").split("&")]
        if not mine:
            return 0
        removed = 0
        try:
            connection.execute("BEGIN")
            for scope in mine:
                removed += connection.execute(
                    "DELETE FROM messages WHERE session_scope = ?", (scope,)
                ).rowcount
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            raise
    return removed
