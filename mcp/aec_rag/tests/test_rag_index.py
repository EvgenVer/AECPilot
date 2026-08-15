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
    DEFAULT_EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    RagIndexError,
    RagSettings,
    index_dir,
    load_settings,
    open_index,
    read_fingerprint,
)


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

    async def embed(texts, **kwargs):
        return np.zeros((len(texts), settings.embedding_dim), dtype=np.float32)

    return EmbeddingFunc(
        embedding_dim=settings.embedding_dim,
        max_token_size=8192,
        model_name=settings.embedding_model,
        func=embed,
    )


async def stub_llm(prompt, system_prompt=None, **kwargs):
    raise AssertionError("тест не должен звать модель")


def test_empty_setting_means_not_chosen_yet_and_resolves_to_the_default(tmp_path):
    settings = load_settings(make_vault(tmp_path, {"embedding_model": ""}))

    assert settings.embedding_model == DEFAULT_EMBEDDING_MODEL
    assert settings.embedding_dim == EMBEDDING_DIMENSIONS[DEFAULT_EMBEDDING_MODEL]


def test_configured_model_is_used_with_its_own_dimension(tmp_path):
    settings = load_settings(make_vault(tmp_path, {"embedding_model": "text-embedding-3-small"}))

    assert settings.embedding_model == "text-embedding-3-small"
    assert settings.embedding_dim == 1536


def test_unknown_model_is_an_error_not_a_guess(tmp_path):
    """Guessing the dimension builds an index that only fails on the first
    query — long after the mistake was made.
    """
    vault = make_vault(tmp_path, {"embedding_model": "text-embedding-4-imaginary"})

    with pytest.raises(RagIndexError) as excinfo:
        load_settings(vault)

    assert "text-embedding-4-imaginary" in str(excinfo.value)


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
    assert fingerprint["embedding_model"] == DEFAULT_EMBEDDING_MODEL
    assert fingerprint["embedding_dim"] == EMBEDDING_DIMENSIONS[DEFAULT_EMBEDDING_MODEL]


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
    assert DEFAULT_EMBEDDING_MODEL in message
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
    monkeypatch.setenv(rag_index.API_KEY_ENV_VAR, "тест")

    settings = RagSettings(embedding_model=DEFAULT_EMBEDDING_MODEL, embedding_dim=3072)
    await rag_index._default_embedding_func(settings).func(["текст"])

    assert seen["embedding_dim"] == 3072
    assert seen["model"] == DEFAULT_EMBEDDING_MODEL
    # And the call goes to the unwrapped implementation, not through their
    # wrapper a second time — that is the double decoration their docstring
    # warns about.
    assert wrapper.embedding_dim != 3072
