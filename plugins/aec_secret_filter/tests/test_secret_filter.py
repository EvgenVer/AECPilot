"""Задача 5.3 — фильтр секретов на диалогах-фикстурах.

Фикстуры написаны РЕПЛИКАМИ, а не строками: спека говорит про диалог, и вопрос
всегда один — «что агент понесёт в память после такого разговора». Половина
фикстур НЕГАТИВНАЯ (обычные фразы про пароли и ключи), потому что фильтр,
который режет разговор о секретах, отключат в первую неделю, а выключенный
фильтр не защищает ни от чего.
"""

from __future__ import annotations

import sys
import types

import pytest
from aec_secret_filter import _on_pre_tool_call, autowrite_enabled, install_sync_guard
from aec_secret_filter.secrets import find_secrets, redact_secrets

# ─── ЧТО ЗАПОМИНАТЬ НЕЛЬЗЯ ────────────────────────────────────────────────────
SECRETS = [
    ("ключ OpenAI", "Ключ проекта: sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2", "openai_key"),
    (
        "токен GitHub",
        "положил ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 в переменные",
        "github_token",
    ),
    ("ключ AWS", "доступ AKIAIOSFODNN7EXAMPLE к бакету со сканами", "aws_access_key"),
    ("ключ Google", "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q", "google_api_key"),
    ("токен Slack", "бот подключён по xoxb-1234567890-ABCdefGHIjkl", "slack_token"),
    (
        "закрытый ключ",
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----",
        "private_key",
    ),
    (
        "JWT",
        "сессия eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0."
        "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        "jwt",
    ),
    (
        "строка подключения",
        "база postgres://aecpilot:Sekret12345@10.0.0.4:5432/objects",
        "connection_string_password",
    ),
    ("заголовок авторизации", "шлём Authorization: Bearer abcdefgh12345678ijkl", "auth_header"),
    ("пароль с названием", "пароль: Qwerty12345!", "labelled_secret"),
    ("api_key с названием", 'api_key = "a1b2c3d4e5f6g7h8"', "labelled_secret"),
    # Добавлено по живому замеру: первая версия правила требовала разделитель
    # ВПЛОТНУЮ и пропустила именно такую фразу — пароль уехал в слой 2.
    (
        "пароль через тире и три слова",
        "запомни: пароль от почты объекта — Qwerty12345!, и ещё резерв 20 процентов",
        "labelled_secret",
    ),
    ("ключ доступа через тире", "ключ доступа для выгрузки — a1b2c3d4e5f6", "labelled_secret"),
]


@pytest.mark.parametrize("label,text,expected", SECRETS, ids=[s[0] for s in SECRETS])
def test_секрет_виден(label: str, text: str, expected: str) -> None:
    assert expected in find_secrets(text), label


# ─── О ЧЁМ ГОВОРИТЬ МОЖНО ─────────────────────────────────────────────────────
# Реплики, в которых слова «пароль», «ключ», «токен» есть, а значения нет. Все
# они — законные факты проекта или человека, и запись обязана пройти.
INNOCENT = [
    ("разговор о пароле", "Пароль от почты храню в менеджере паролей, в переписке не передаю."),
    ("правило про ключи", "Ключи доступа к серверу заказчика выдаёт их админ, а не мы."),
    ("факт проекта", "Заказчик просил закладывать резерв мощности 20% на всех объектах."),
    ("предпочтение человека", "Веду раздел ОВ, отвечай коротко и по делу."),
    ("токен как термин", "Токен в их API живёт час, поэтому длинные выгрузки бьём на части."),
    ("api key без значения", "api_key нужно будет запросить у подрядчика."),
    ("короткое значение", "код подъезда: 1234"),
    ("путь, похожий на ключ", "смета лежит в D:/объекты/секретный-корпус/смета.xlsx"),
    # Разрыв между названием и значением РАЗРЕШЁН — значит эти обязаны остаться
    # проходящими: в них нет значения, только разговор о нём.
    ("название и тире без значения", "пароль от почты — его знает только бухгалтерия"),
    ("название и разделитель, значение словом", "api_key это обычная строка из консоли"),
    ("значение без букв", "ключ доступа к воротам — 12345678"),
]


@pytest.mark.parametrize("label,text", INNOCENT, ids=[s[0] for s in INNOCENT])
def test_обычная_фраза_проходит(label: str, text: str) -> None:
    assert find_secrets(text) == [], label


# ─── ХУК: ОБА СЛОЯ И ОБЕ ФОРМЫ ВЫЗОВА ─────────────────────────────────────────
def test_слой_1_отказ() -> None:
    verdict = _on_pre_tool_call("memory", {"action": "add", "content": "пароль: Qwerty12345!"})

    assert verdict is not None
    assert verdict["action"] == "block"


def test_слой_2_отказ() -> None:
    verdict = _on_pre_tool_call("mem0_add", {"content": "ключ sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2"})

    assert verdict is not None
    assert verdict["action"] == "block"


def test_пакетная_запись_не_проскакивает() -> None:
    # Их `memory` умеет список операций. Без разбора `operations` пакет прошёл
    # бы мимо фильтра целиком — самый дешёвый способ обойти его.
    verdict = _on_pre_tool_call(
        "memory",
        {
            "operations": [
                {"action": "add", "content": "заказчик просил резерв 20%"},
                {"action": "add", "content": "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"},
            ]
        },
    )

    assert verdict is not None
    assert verdict["action"] == "block"


def test_замена_смотрит_и_на_старый_текст() -> None:
    verdict = _on_pre_tool_call(
        "memory",
        {"action": "replace", "old_text": "пароль: Qwerty12345!", "content": "пароль сменили"},
    )

    assert verdict is not None


def test_отказ_не_повторяет_сам_секрет() -> None:
    # Иначе значение уехало бы в переписку, из которой его и не пускали.
    verdict = _on_pre_tool_call("mem0_add", {"content": "пароль: Qwerty12345!"})

    assert "Qwerty12345" not in verdict["message"]
    assert "labelled_secret" in verdict["message"]


def test_чужой_инструмент_не_трогаем() -> None:
    # Фильтр стоит на пути ЗАПИСИ В ПАМЯТЬ. Тот же текст в `write_file` — не его
    # дело: там свои правила и свой сканер.
    assert _on_pre_tool_call("write_file", {"content": "пароль: Qwerty12345!"}) is None


@pytest.mark.parametrize(
    "tool", ["browser_vault_fill", "browser_vault_list", "browser_vault_unlock"]
)
def test_сейф_паролей_отклоняется(tool: str) -> None:
    # 3G.10, HX24: инструмент сейфа ядро подключает с браузером, отказ — здесь.
    verdict = _on_pre_tool_call(tool, {"site": "example.com"})
    assert verdict is not None
    assert verdict["action"] == "block"


def test_браузер_не_сейф_проходит() -> None:
    assert _on_pre_tool_call("browser_exec", {"code": "print(1)"}) is None


def test_обычная_запись_проходит() -> None:
    assert _on_pre_tool_call("memory", {"action": "add", "content": "резерв 20%"}) is None


def test_просьба_человека_фильтр_не_отменяет() -> None:
    # Пограничный случай спеки: «Секрет в тексте, который человек САМ просит
    # запомнить → фильтр всё равно срабатывает». Хук стоит на вызове
    # инструмента и о том, кто попросил, не знает вовсе — проверяем, что это
    # действительно так, а не на словах.
    verdict = _on_pre_tool_call(
        "memory",
        {"action": "add", "content": "запомни мой пароль: Qwerty12345!, я его забываю"},
    )

    assert verdict is not None
    assert verdict["action"] == "block"


# ─── ВТОРОЙ ПУТЬ: АВТОЗАПИСЬ ХОДА ─────────────────────────────────────────────
# Замер `runtime/memory-autowrite-probe.mjs` показал, что хук этот путь не видит
# вовсе: пароль уехал в слой 2 дословно при включённом фильтре. Здесь проверяется
# обёртка, которая его закрывает.
def test_вырезание_убирает_значение_и_оставляет_факт() -> None:
    clean, found = redact_secrets("пароль: Qwerty12345!, и ещё резерв мощности 20 процентов")

    assert "Qwerty12345" not in clean
    assert "labelled_secret" in found
    assert "резерв мощности 20 процентов" in clean, "обычный факт рядом терять нельзя"


def test_вырезание_не_трогает_обычную_фразу() -> None:
    text = "Пароль от почты храню в менеджере паролей."

    assert redact_secrets(text) == (text, [])


def test_обёртка_встаёт_на_воронку_и_чистит_ход() -> None:
    # Подменяется атрибут КЛАССА, поэтому проверяется на подделке с тем же именем
    # метода: настоящий `MemoryManager` тянет за собой половину ядра.
    seen: list[tuple[str, str]] = []

    class FakeManager:
        def sync_all(self, user_content, assistant_content, **kwargs):
            seen.append((user_content, assistant_content))

    fake_module = types.ModuleType("agent.memory_manager")
    fake_module.MemoryManager = FakeManager
    sys.modules["agent.memory_manager"] = fake_module
    try:
        assert install_sync_guard() is True
        FakeManager().sync_all("запомни api_key = a1b2c3d4e5f6g7h8 для выгрузки", "Записал.")
    finally:
        del sys.modules["agent.memory_manager"]

    assert seen, "обёртка обязана позвать оригинал, а не съесть ход"
    user_text, _ = seen[0]
    assert "a1b2c3d4e5f6g7h8" not in user_text
    assert "для выгрузки" in user_text


def test_обёртка_чистит_и_messages() -> None:
    # `sync_all` умеет принимать ещё и сырой список сообщений. Почистив только
    # текст, мы оставили бы секрет во втором аргументе — и не заметили бы.
    seen: list[dict] = []

    class FakeManager:
        def sync_all(self, user_content, assistant_content, **kwargs):
            seen.append(kwargs)

    fake_module = types.ModuleType("agent.memory_manager")
    fake_module.MemoryManager = FakeManager
    sys.modules["agent.memory_manager"] = fake_module
    try:
        install_sync_guard()
        FakeManager().sync_all(
            "без секрета",
            "Записал.",
            messages=[{"role": "user", "content": "пароль: Qwerty12345!"}],
        )
    finally:
        del sys.modules["agent.memory_manager"]

    assert "Qwerty12345" not in str(seen[0]["messages"])


def test_обёртка_не_навешивается_дважды() -> None:
    class FakeManager:
        def sync_all(self, user_content, assistant_content, **kwargs):
            return None

    fake_module = types.ModuleType("agent.memory_manager")
    fake_module.MemoryManager = FakeManager
    sys.modules["agent.memory_manager"] = fake_module
    try:
        install_sync_guard()
        once = FakeManager.sync_all
        install_sync_guard()
        assert FakeManager.sync_all is once
    finally:
        del sys.modules["agent.memory_manager"]


def test_пропавшая_воронка_видна_отказом_а_не_тишиной() -> None:
    # Подъём пина может унести метод. Тогда автозапись снова открыта, и узнать об
    # этом надо по `False` и строке в логе, а не по утечке.
    class Without:
        pass

    fake_module = types.ModuleType("agent.memory_manager")
    fake_module.MemoryManager = Without
    sys.modules["agent.memory_manager"] = fake_module
    try:
        assert install_sync_guard() is False
    finally:
        del sys.modules["agent.memory_manager"]


# ─── ПЕРЕКЛЮЧАТЕЛЬ АВТОЗАПИСИ (задача 5.4) ────────────────────────────────────
# У ядра выключателя для этого пути нет, поэтому решение человека исполняет та же
# обёртка воронки. Проверяется, что выключено значит выключено, а отсутствие или
# мусор в файле НЕ выключают память молча.
def _with_home(tmp_path, monkeypatch):
    fake = types.ModuleType("hermes_constants")
    fake.get_hermes_home = lambda: tmp_path
    monkeypatch.setitem(sys.modules, "hermes_constants", fake)


def test_нет_файла_автозапись_включена(tmp_path, monkeypatch) -> None:
    _with_home(tmp_path, monkeypatch)

    assert autowrite_enabled() is True


def test_мусор_в_файле_не_выключает_память(tmp_path, monkeypatch) -> None:
    _with_home(tmp_path, monkeypatch)
    (tmp_path / "aec-memory.json").write_text("{не json", encoding="utf-8")

    assert autowrite_enabled() is True


def test_выключено_значит_выключено(tmp_path, monkeypatch) -> None:
    _with_home(tmp_path, monkeypatch)
    (tmp_path / "aec-memory.json").write_text('{"autowrite": false}', encoding="utf-8")

    assert autowrite_enabled() is False


def test_выключенная_автозапись_не_доходит_до_провайдера(tmp_path, monkeypatch) -> None:
    _with_home(tmp_path, monkeypatch)
    (tmp_path / "aec-memory.json").write_text('{"autowrite": false}', encoding="utf-8")

    seen: list[tuple[str, str]] = []

    class FakeManager:
        def sync_all(self, user_content, assistant_content, **kwargs):
            seen.append((user_content, assistant_content))

    fake_module = types.ModuleType("agent.memory_manager")
    fake_module.MemoryManager = FakeManager
    monkeypatch.setitem(sys.modules, "agent.memory_manager", fake_module)

    install_sync_guard()
    FakeManager().sync_all("заказчик просил резерв 20%", "Записал.")

    assert seen == [], "выключенный переключатель обязан останавливать ход до провайдера"


class _Ctx:
    def __init__(self) -> None:
        self.sections: dict[str, str] = {}

    def register_hook(self, name: str, fn) -> None:  # noqa: ANN001
        pass

    def register_system_prompt_section(self, section_id: str, text: str) -> None:
        self.sections[section_id] = text


def test_разделы_промпта_продукт_и_память(monkeypatch: pytest.MonkeyPatch) -> None:
    # 3G.12: имя продукта, навык — по нужде, память — когда вопрос зависит от прежних решений.
    import aec_secret_filter

    monkeypatch.setattr(aec_secret_filter, "install_sync_guard", lambda: True)
    ctx = _Ctx()
    aec_secret_filter.register(ctx)

    product = ctx.sections["aec-product"]
    assert "AECPilot" in product
    assert "skill_view" in product
    assert "earlier project decisions" in product
    # D-168: имя поиска по документам — чтобы агент не искал его через tool_search.
    assert "mcp__aec_rag__rag_query" in product
    # D-123: окна ОС — тот же отложенный набор.
    assert "read_window_below" in product
    # Бюджет 200 + одобренные владельцем подсказки D-168 и D-123.
    assert len(product) // 4 < 250
    assert "mem0_add" in ctx.sections["aec-memory-routing"]
