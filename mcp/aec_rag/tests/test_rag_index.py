"""Tests for the per-project LightRAG index (task 2.8).

The embedding and LLM functions are stubs: this task is about where the index
lives and what guards it, not about the model. Nothing here calls a paid API.
"""

from __future__ import annotations

import json

import numpy as np
import pytest
from aec_rag.project_config import ProjectConfigError
from aec_rag.rag_index import (
    EXTRACTION_LANGUAGE,
    RagIndexError,
    RagSettings,
    drop_index,
    index_dir,
    load_settings,
    open_index,
    read_fingerprint,
)

from conftest import TEST_EMBEDDING_MODEL

STUB_DIM = 16


def make_vault(tmp_path, settings=None):
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps(
            {"schema_version": 1, "name": "тест", "sources": [], "settings": settings or {}},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return vault


def stub_embedding(settings: RagSettings):
    from lightrag.utils import EmbeddingFunc

    dim = settings.embedding_dim or STUB_DIM

    async def embed(texts, **kwargs):
        return np.zeros((len(texts), dim), dtype=np.float32)

    return EmbeddingFunc(
        embedding_dim=dim,
        max_token_size=8192,
        model_name=settings.embedding_model,
        func=embed,
    )


async def stub_llm(prompt, system_prompt=None, **kwargs):
    raise AssertionError("тест не должен звать модель")


def test_empty_setting_means_not_chosen_and_resolves_to_the_providers_model(tmp_path):
    settings = load_settings(make_vault(tmp_path, {"embedding_model": ""}))

    assert settings.embedding_model == TEST_EMBEDDING_MODEL
    # Unknown until the index is opened: never guessed from a list (D-154).
    assert settings.embedding_dim is None


def test_configured_model_wins_over_the_providers(tmp_path):
    settings = load_settings(make_vault(tmp_path, {"embedding_model": "any-other-model"}))

    assert settings.embedding_model == "any-other-model"


def test_no_model_and_no_provider_is_said_not_guessed(tmp_path, monkeypatch):
    """C5: nothing falls back to a provider we picked."""
    monkeypatch.delenv("AEC_RAG_EMBEDDING_MODEL")

    with pytest.raises(RagIndexError) as excinfo:
        load_settings(make_vault(tmp_path))

    assert "провайдер" in str(excinfo.value)


def test_no_provider_answers_with_the_apps_reason(tmp_path, monkeypatch):
    """3G.49: an agent on a subscription — the refusal names why and where."""
    monkeypatch.delenv("AEC_RAG_EMBEDDING_MODEL")
    reason = "агент работает через «openai-codex» — выберите провайдера в окне «Индекс и память»"
    monkeypatch.setenv("AEC_RAG_UNAVAILABLE", reason)

    with pytest.raises(RagIndexError) as excinfo:
        load_settings(make_vault(tmp_path))

    assert str(excinfo.value) == reason


@pytest.mark.anyio
async def test_the_width_is_measured_once_then_read_from_the_fingerprint(tmp_path, monkeypatch):
    import lightrag.llm.openai as openai_module

    calls: list[dict] = []

    async def fake_embed(texts, **kwargs):
        calls.append(kwargs)
        return np.zeros((len(texts), 24), dtype=np.float32)

    monkeypatch.setattr(openai_module.openai_embed, "func", fake_embed)
    vault = make_vault(tmp_path)

    await open_index(vault, load_settings(vault), llm_func=stub_llm)

    assert len(calls) == 1 and "embedding_dim" not in calls[0]
    assert calls[0]["base_url"] == "http://127.0.0.1:9/v1"
    assert read_fingerprint(vault)["embedding_dim"] == 24
    assert load_settings(vault).embedding_dim == 24


def test_missing_project_json_is_reported_as_such(tmp_path):
    with pytest.raises(ProjectConfigError):
        load_settings(tmp_path / "нет-такого-vault")


@pytest.mark.anyio
async def test_index_is_created_inside_the_vault(tmp_path):
    vault = make_vault(tmp_path)
    settings = load_settings(vault)

    rag = await open_index(
        vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm
    )

    assert rag is not None
    assert index_dir(vault) == vault / ".aecpilot" / "lightrag"
    assert index_dir(vault).is_dir()
    assert any(index_dir(vault).iterdir())


@pytest.mark.anyio
async def test_opening_records_which_model_built_the_index(tmp_path):
    vault = make_vault(tmp_path)
    settings = load_settings(vault)

    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)

    fingerprint = read_fingerprint(vault)
    assert fingerprint["embedding_model"] == TEST_EMBEDDING_MODEL
    assert fingerprint["embedding_dim"] == STUB_DIM


@pytest.mark.anyio
async def test_a_changed_embedding_model_refuses_to_open_and_says_why(tmp_path):
    """C5: vectors of one model mean nothing to another. A silent open would
    look like the product answering badly, not like a setting that changed.
    """
    vault = make_vault(tmp_path)
    first = load_settings(vault)
    await open_index(vault, first, embedding_func=stub_embedding(first), llm_func=stub_llm)

    second = RagSettings(embedding_model="text-embedding-3-small", embedding_dim=1536)
    with pytest.raises(RagIndexError) as excinfo:
        await open_index(vault, second, embedding_func=stub_embedding(second), llm_func=stub_llm)

    message = str(excinfo.value)
    assert TEST_EMBEDDING_MODEL in message
    assert "повторный ingest" in message


@pytest.mark.anyio
async def test_index_opens_under_a_cyrillic_vault_path(tmp_path):
    """D-19: every library handed a vault path is asked this question after
    Docling turned out not to survive one.
    """
    vault = make_vault(tmp_path / "проекты" / "ЖК Нагатинский")
    settings = load_settings(vault)

    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)

    assert index_dir(vault).is_dir()


@pytest.mark.anyio
async def test_the_embedding_call_states_the_width_it_expects(monkeypatch):
    """Their `openai_embed` is decorated into an `EmbeddingFunc` that declares
    the width of `text-embedding-3-small` and validates every answer against
    that number. Called as a function from inside our own `EmbeddingFunc` it
    dies on our 3072-wide model with «expected 10 vectors but got 20» — measured
    2026-08-15, task 2.9a. No stub caught it, because every other test here
    injects its own embedding function; this one exercises the real default.
    """
    import lightrag.llm.openai as openai_module
    from aec_rag import rag_index

    seen: dict = {}

    async def fake_embed(texts, **kwargs):
        seen.update(kwargs)
        return np.zeros((len(texts), kwargs["embedding_dim"]), dtype=np.float32)

    wrapper = openai_module.openai_embed
    monkeypatch.setattr(wrapper, "func", fake_embed)

    settings = RagSettings(embedding_model=TEST_EMBEDDING_MODEL, embedding_dim=3072)
    await rag_index._default_embedding_func(settings).func(["текст"])

    assert seen["embedding_dim"] == 3072
    assert seen["model"] == TEST_EMBEDDING_MODEL
    assert seen["api_key"] == "тест" and seen["base_url"] == "http://127.0.0.1:9/v1"
    # And the call goes to the unwrapped implementation, not through their
    # wrapper a second time — that is the double decoration their docstring
    # warns about.
    assert wrapper.embedding_dim != 3072


# ---------------------------------------------------------------------------
# Находка D-38: язык извлечения
# ---------------------------------------------------------------------------


def test_extraction_language_defaults_to_the_one_readers_actually_read(tmp_path):
    """Без этого LightRAG велит писать имена сущностей по-английски, и русский
    документ даёт одну сущность дважды: переводом и транслитерацией."""
    assert load_settings(make_vault(tmp_path)).extraction_language == EXTRACTION_LANGUAGE


def test_extraction_language_can_be_chosen_per_project(tmp_path):
    vault = make_vault(tmp_path, {"extraction_language": "English"})

    assert load_settings(vault).extraction_language == "English"


def test_blank_extraction_language_means_not_chosen_yet(tmp_path):
    vault = make_vault(tmp_path, {"extraction_language": "   "})

    assert load_settings(vault).extraction_language == EXTRACTION_LANGUAGE


@pytest.mark.anyio
async def test_the_extraction_language_reaches_lightrag(tmp_path, monkeypatch):
    """Проверяется именно ПЕРЕДАЧА: настройка, не доехавшая до `addon_params`,
    ничего не меняет, а выглядит сделанной работой."""
    vault = make_vault(tmp_path)
    settings = load_settings(vault)

    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)

    # `open_index` берёт класс отложенным импортом (`from lightrag import
    # LightRAG` в теле функции), поэтому подменяется он в СВОЁМ модуле.
    import lightrag

    seen = {}
    real = lightrag.LightRAG

    def spy(*args, **kwargs):
        seen.update(kwargs)
        return real(*args, **kwargs)

    monkeypatch.setattr(lightrag, "LightRAG", spy)
    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)

    assert seen["addon_params"] == {"language": EXTRACTION_LANGUAGE}


@pytest.mark.anyio
async def test_opening_records_the_language_the_index_was_built_in(tmp_path):
    vault = make_vault(tmp_path)
    settings = load_settings(vault)

    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)

    assert read_fingerprint(vault)["extraction_language"] == EXTRACTION_LANGUAGE


@pytest.mark.anyio
async def test_a_changed_extraction_language_refuses_to_open_and_says_why(tmp_path):
    """D-38: дописать в граф на другом языке значит завести ВТОРОЕ имя каждой
    сущности — ровно тот дубль, ради устранения которого язык и задаётся."""
    vault = make_vault(tmp_path)
    first = load_settings(vault)
    await open_index(vault, first, embedding_func=stub_embedding(first), llm_func=stub_llm)

    second = RagSettings(
        embedding_model=first.embedding_model,
        embedding_dim=first.embedding_dim,
        extraction_language="English",
    )
    with pytest.raises(RagIndexError) as excinfo:
        await open_index(vault, second, embedding_func=stub_embedding(second), llm_func=stub_llm)

    message = str(excinfo.value)
    assert EXTRACTION_LANGUAGE in message
    assert "два имени на двух языках" in message


@pytest.mark.anyio
async def test_an_index_built_before_this_field_is_not_declared_incompatible(tmp_path):
    """Старые индексы собраны английским умолчанием LightRAG и поля не несут.
    Потребовать повторный ingest у того, кто ничего не менял, — не починка."""
    vault = make_vault(tmp_path)
    settings = load_settings(vault)
    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)

    path = index_dir(vault) / "aec-index.json"
    old = json.loads(path.read_text(encoding="utf-8"))
    del old["extraction_language"]
    path.write_text(json.dumps(old, ensure_ascii=False), encoding="utf-8")

    await open_index(vault, settings, embedding_func=stub_embedding(settings), llm_func=stub_llm)


# ---------------------------------------------------------------------------
# Задача 3G.7: перестройка под другую модель эмбеддингов
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_drop_index_lets_another_model_build_it_and_keeps_the_persons_choice(tmp_path):
    from aec_rag.db import open_index as open_store
    from aec_rag.graph_scope import documents_in_graph, mark_in_graph

    vault = make_vault(tmp_path, {"graph": [{"path": "src", "kind": "folder"}]})
    first = load_settings(vault)
    await open_index(vault, first, embedding_func=stub_embedding(first), llm_func=stub_llm)
    conn = open_store(vault / ".aecpilot" / "index.db")
    mark_in_graph(conn, "src", "a.docx", "h", 3)
    conn.close()
    project_before = (vault / ".aecpilot" / "project.json").read_text(encoding="utf-8")

    other = RagSettings(embedding_model="another-model", embedding_dim=8)
    with pytest.raises(RagIndexError):
        await open_index(vault, other, embedding_func=stub_embedding(other), llm_func=stub_llm)

    drop_index(vault)

    await open_index(vault, other, embedding_func=stub_embedding(other), llm_func=stub_llm)
    assert read_fingerprint(vault)["embedding_model"] == "another-model"
    conn = open_store(vault / ".aecpilot" / "index.db")
    assert documents_in_graph(conn) == []
    conn.close()
    assert (vault / ".aecpilot" / "project.json").read_text(encoding="utf-8") == project_before


def test_drop_index_on_a_vault_without_an_index_is_a_no_op(tmp_path):
    drop_index(make_vault(tmp_path))
