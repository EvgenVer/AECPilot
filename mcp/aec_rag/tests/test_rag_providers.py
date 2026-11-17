"""Task T80 (UR53, decision 0021): embeddings and the extraction model may come
from DIFFERENT providers, and a local address (Ollama, LM Studio) needs no key.

Nothing here calls a model: the OpenAI-compatible calls are replaced and only
the address and key they would be made with are checked.
"""

from __future__ import annotations

import numpy as np
import pytest
from aec_rag import rag_index
from aec_rag.rag_index import RagIndexError, RagSettings, api_key, base_url

from conftest import TEST_EMBEDDING_MODEL


def test_without_extraction_settings_both_use_the_shared_provider():
    assert base_url("extraction") == base_url("embedding") == "http://127.0.0.1:9/v1"
    assert api_key("extraction") == api_key("embedding") == "тест"


def test_extraction_has_its_own_address_and_key(monkeypatch):
    monkeypatch.setenv("AEC_RAG_EXTRACTION_BASE_URL", "https://extract.example/v1")
    monkeypatch.setenv("AEC_RAG_EXTRACTION_KEY_ENV", "EXTRACT_KEY")
    monkeypatch.setenv("EXTRACT_KEY", "ключ-разбора")

    assert base_url("extraction") == "https://extract.example/v1"
    assert api_key("extraction") == "ключ-разбора"
    # Embeddings stay where they were.
    assert base_url("embedding") == "http://127.0.0.1:9/v1"
    assert api_key("embedding") == "тест"


def test_a_local_address_without_a_key_is_accepted(monkeypatch):
    monkeypatch.setenv("AEC_RAG_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setenv("AEC_RAG_KEY_ENV", "")

    assert base_url("embedding") == "http://127.0.0.1:11434/v1"
    # The OpenAI client refuses an empty key; a local server ignores it.
    assert api_key("embedding") == rag_index.NO_KEY_PLACEHOLDER


def test_a_named_key_variable_that_is_empty_is_still_an_error(monkeypatch):
    monkeypatch.setenv("AEC_RAG_TEST_API_KEY", "")

    with pytest.raises(RagIndexError, match="AEC_RAG_TEST_API_KEY"):
        api_key("embedding")


def test_no_address_at_all_is_said_not_guessed(monkeypatch):
    monkeypatch.delenv("AEC_RAG_BASE_URL")
    monkeypatch.setenv("AEC_RAG_KEY_ENV", "")

    with pytest.raises(RagIndexError, match="провайдер"):
        api_key("embedding")


@pytest.mark.anyio
async def test_the_calls_go_to_their_own_providers(monkeypatch):
    import lightrag.llm.openai as openai_module

    monkeypatch.setenv("AEC_RAG_EXTRACTION_BASE_URL", "https://extract.example/v1")
    monkeypatch.setenv("AEC_RAG_EXTRACTION_KEY_ENV", "EXTRACT_KEY")
    monkeypatch.setenv("EXTRACT_KEY", "ключ-разбора")
    monkeypatch.setenv("AEC_RAG_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setenv("AEC_RAG_KEY_ENV", "")

    embedded: dict = {}
    completed: dict = {}

    async def fake_embed(texts, **kwargs):
        embedded.update(kwargs)
        return np.zeros((len(texts), kwargs["embedding_dim"]), dtype=np.float32)

    async def fake_complete(model, prompt, **kwargs):
        completed.update(kwargs, model=model)
        return "ok"

    monkeypatch.setattr(openai_module.openai_embed, "func", fake_embed)
    monkeypatch.setattr(openai_module, "openai_complete_if_cache", fake_complete)

    settings = RagSettings(
        embedding_model=TEST_EMBEDDING_MODEL, embedding_dim=8, extraction_model="разбор"
    )
    await rag_index._default_embedding_func(settings).func(["текст"])
    await rag_index._default_llm_func(settings)("prompt")

    assert embedded["base_url"] == "http://127.0.0.1:11434/v1"
    assert embedded["api_key"] == rag_index.NO_KEY_PLACEHOLDER
    assert completed["base_url"] == "https://extract.example/v1"
    assert completed["api_key"] == "ключ-разбора"
