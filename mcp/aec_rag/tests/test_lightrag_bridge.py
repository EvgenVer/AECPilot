"""Tests for the chunk bridge into LightRAG (task 2.10a).

The question these answer is the only one that matters about this seam: does a
chunk we put into the index come back out of a search as *our* chunk, with the
locator we attached to it. Everything else — how many vectors, how fast — is
measured elsewhere.

No paid API is called: the embedding function is a deterministic bag-of-words
hash, which is enough for a nearest-neighbour search to prefer the chunk that
shares words with the query.
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
import pytest
from aec_rag.chunk import Chunk
from aec_rag.lightrag_bridge import (
    SKIP_KG,
    BridgeError,
    ChunkRegistry,
    IndexedChunk,
    chunk_key,
    delete_document,
    document_content,
    document_id,
    insert_document,
    lightrag_file_path,
    split_chunk_key,
)
from aec_rag.rag_index import RagSettings, open_index
from aec_rag.store import chunk_id as make_chunk_id
from aec_rag.store import store_chunks

DIM = 64


def make_vault(tmp_path):
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps({"schema_version": 1, "name": "тест", "sources": []}, ensure_ascii=False),
        encoding="utf-8",
    )
    return vault


def _vector(text: str) -> np.ndarray:
    """A bag-of-words hash embedding: same words → close vectors."""
    vector = np.zeros(DIM, dtype=np.float32)
    for word in text.lower().split():
        digest = hashlib.sha256(word.encode()).digest()
        vector[digest[0] % DIM] += 1.0
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm else vector


def word_embedding():
    from lightrag.utils import EmbeddingFunc

    async def embed(texts, **kwargs):
        return np.array([_vector(text) for text in texts], dtype=np.float32)

    return EmbeddingFunc(
        embedding_dim=DIM, max_token_size=8192, model_name="stub", func=embed
    )


async def forbidden_llm(prompt, system_prompt=None, **kwargs):
    raise AssertionError("уровень 1 не имеет права звать модель")


async def open_stub_index(vault, llm_func=forbidden_llm):
    settings = RagSettings(embedding_model="text-embedding-3-large", embedding_dim=DIM)
    return await open_index(vault, settings, embedding_func=word_embedding(), llm_func=llm_func)


def indexed(chunks: list[Chunk], source_id="tasks", rel_path="задание.pdf"):
    return [
        IndexedChunk(
            chunk_id=make_chunk_id(source_id, rel_path, ordinal, chunk.text), text=chunk.text
        )
        for ordinal, chunk in enumerate(chunks)
    ]


def test_document_id_follows_the_file_not_its_contents():
    first = document_id("tasks", "ЭОМ/задание.pdf")
    assert first == document_id("tasks", "ЭОМ/задание.pdf")
    assert first != document_id("tasks", "ЭОМ/задание_ред2.pdf")
    assert first != document_id("norms", "ЭОМ/задание.pdf")


def test_chunk_key_round_trips():
    doc = document_id("tasks", "задание.pdf")
    key = chunk_key(doc, "chunk-abc")

    assert key == f"{doc}-chunk-abc"
    assert split_chunk_key(key) == (doc, "chunk-abc")
    assert split_chunk_key("не-ключ") is None


def test_skip_kg_flag_is_the_one_lightrag_defines():
    from lightrag.constants import PROCESS_OPTION_SKIP_KG

    assert SKIP_KG == PROCESS_OPTION_SKIP_KG


def test_registry_hands_back_our_chunks_verbatim():
    registry = ChunkRegistry()
    chunks = [IndexedChunk("chunk-1", "первый абзац"), IndexedChunk("chunk-2", "второй абзац")]

    content = registry.register(chunks, document_content("tasks", "а.pdf", chunks))
    result = registry.chunk(None, content, None, False, 0, 10)

    assert [entry["content"] for entry in result] == ["первый абзац", "второй абзац"]
    assert [entry["chunk_id"] for entry in result] == ["chunk-1", "chunk-2"]
    assert [entry["chunk_order_index"] for entry in result] == [0, 1]


def test_unregistered_content_raises_rather_than_silently_losing_locators():
    """A fallback to their chunker would index the document perfectly well and
    lose every locator in it — and only citations that open nothing would show
    it, much later.
    """
    registry = ChunkRegistry()

    with pytest.raises(BridgeError):
        registry.chunk(None, "текст, которого мы не регистрировали", None, False, 0, 10)


@pytest.mark.anyio
async def test_our_chunk_comes_back_from_a_query_under_our_own_id(tmp_path):
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    chunks = [
        Chunk(
            text="Установленная мощность по заданию ЭОМ составляет 250 кВт.",
            locator={"page": 12},
        ),
        Chunk(text="Категория надёжности электроснабжения — вторая.", locator={"page": 13}),
    ]
    entries = indexed(chunks)
    doc = document_id("tasks", "задание.pdf")

    keys = await insert_document(
        rag, source_id="tasks", rel_path="задание.pdf", chunks=entries
    )

    assert keys == [chunk_key(doc, entry.chunk_id) for entry in entries]

    from lightrag.base import QueryParam

    result = await rag.aquery_data(
        "установленная мощность", param=QueryParam(mode="naive", enable_rerank=False)
    )
    returned = {chunk["chunk_id"] for chunk in result["data"]["chunks"]}

    assert keys[0] in returned
    # …and the key alone is enough to recover the locator from index.db.
    assert split_chunk_key(keys[0])[1] == entries[0].chunk_id


@pytest.mark.anyio
async def test_chunks_are_not_re_cut_by_their_token_limit(tmp_path):
    """Their chunker would split a 1500-character chunk into several; ours must
    arrive whole, because the locator is attached to the whole.
    """
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    long_text = "Ведомость нагрузок. " * 90  # ~1800 characters, well over their default
    entries = indexed([Chunk(text=long_text, locator={"page": 3})])

    keys = await insert_document(
        rag, source_id="tasks", rel_path="ведомость.pdf", chunks=entries
    )

    stored = await rag.text_chunks.get_by_id(keys[0])
    assert len(keys) == 1
    assert stored["content"] == long_text


@pytest.mark.anyio
async def test_level_one_ingest_calls_no_model_at_all(tmp_path):
    """UR24: everything is indexed cheaply. `forbidden_llm` asserts on call, so
    reaching the end of this test is the assertion.
    """
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    entries = indexed([Chunk(text="Проектная мощность 250 кВт.", locator={"page": 1})])

    await insert_document(
        rag,
        source_id="tasks",
        rel_path="зад.pdf",
        chunks=entries,
        build_graph=False,
    )

    key = chunk_key(document_id("tasks", "зад.pdf"), entries[0].chunk_id)
    assert await rag.text_chunks.get_by_id(key)


@pytest.mark.anyio
async def test_reingest_replaces_the_previous_edition(tmp_path):
    """The old paragraphs must not stay behind to be retrieved and cited as if
    they were still in the document.
    """
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    first = indexed([Chunk(text="Установленная мощность 250 кВт.", locator={"page": 1})])
    old_keys = await insert_document(
        rag, source_id="tasks", rel_path="задание.pdf", chunks=first
    )

    second = indexed([Chunk(text="Установленная мощность 320 кВт.", locator={"page": 1})])
    new_keys = await insert_document(
        rag, source_id="tasks", rel_path="задание.pdf", chunks=second
    )

    assert old_keys != new_keys
    assert await rag.text_chunks.get_by_id(old_keys[0]) is None
    assert (await rag.text_chunks.get_by_id(new_keys[0]))["content"] == second[0].text


@pytest.mark.anyio
async def test_deleting_a_document_reports_whether_it_was_there(tmp_path):
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    doc = document_id("tasks", "задание.pdf")
    await insert_document(
        rag,
        source_id="tasks",
        rel_path="задание.pdf",
        chunks=indexed([Chunk(text="Текст.", locator={"page": 1})]),
    )

    assert await delete_document(rag, doc) is True
    assert await delete_document(rag, doc) is False


@pytest.mark.anyio
async def test_locator_is_recovered_by_joining_the_key_back_to_index_db(tmp_path):
    """The round trip the whole design exists for: a search hit carries a key,
    the key carries our chunk id, and `index.db` turns that id into the page a
    citation names.
    """
    from aec_rag.db import open_index as open_db

    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    index_db = open_db(tmp_path / "index.db")
    chunks = [Chunk(text="Установленная мощность 250 кВт.", locator={"page": 12})]
    ids = store_chunks(index_db, "tasks", "задание.pdf", "sha", chunks)
    entries = [IndexedChunk(chunk_id=ids[0], text=chunks[0].text)]

    keys = await insert_document(
        rag, source_id="tasks", rel_path="задание.pdf", chunks=entries
    )

    from aec_rag.store import get_chunks

    _, chunk_identifier = split_chunk_key(keys[0])
    stored = get_chunks(index_db, [chunk_identifier])[chunk_identifier]
    assert stored.locator == {"page": 12}
    assert stored.rel_path == "задание.pdf"


def test_two_files_with_the_same_name_are_not_one_document():
    """A design project has ЭОМ/Задание.pdf, ОВ/Задание.pdf and ВК/Задание.pdf.
    LightRAG's duplicate check compares basenames, so under its own naming the
    second and third are «duplicates» and are silently not indexed.
    """
    first = lightrag_file_path("tasks", "ЭОМ/Задание.pdf")
    second = lightrag_file_path("tasks", "ОВ/Задание.pdf")

    from pathlib import PurePosixPath, PureWindowsPath

    assert first != second
    assert PurePosixPath(first).name == first
    assert PureWindowsPath(first).name == first


def test_identical_files_in_two_folders_are_distinct_documents():
    """Their second duplicate check hashes the body: the same PDF copied into
    two folders would collide, and one of the two would not be indexed.
    """
    chunks = [IndexedChunk("chunk-1", "один и тот же текст")]

    assert document_content("tasks", "ЭОМ/задание.pdf", chunks) != document_content(
        "tasks", "ОВ/задание.pdf", chunks
    )


@pytest.mark.anyio
async def test_re_inserting_an_unchanged_document_does_not_pay_twice(tmp_path):
    """A full re-ingest of a file that did not change must not re-embed it."""
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    entries = indexed([Chunk(text="Мощность 250 кВт.", locator={"page": 1})])
    await insert_document(rag, source_id="tasks", rel_path="задание.pdf", chunks=entries)

    calls = 0
    original = rag.apipeline_enqueue_documents

    async def counting(*args, **kwargs):
        nonlocal calls
        calls += 1
        return await original(*args, **kwargs)

    rag.apipeline_enqueue_documents = counting
    await insert_document(rag, source_id="tasks", rel_path="задание.pdf", chunks=entries)

    assert calls == 0


@pytest.mark.anyio
async def test_two_projects_in_one_process_do_not_share_a_document_register(tmp_path):
    """LightRAG keeps its shared storage in process-global maps keyed by
    workspace. With the default empty one, `задание.pdf` indexed in project A
    makes `задание.pdf` in project B look like a duplicate — and it is silently
    not indexed. Measured 2026-08-15.
    """
    first = await open_stub_index(make_vault(tmp_path / "первый"))
    second = await open_stub_index(make_vault(tmp_path / "второй"))
    entries = indexed([Chunk(text="Мощность 250 кВт.", locator={"page": 1})])

    keys_a = await insert_document(
        first, source_id="tasks", rel_path="задание.pdf", chunks=entries
    )
    keys_b = await insert_document(
        second, source_id="tasks", rel_path="задание.pdf", chunks=entries
    )

    assert await first.text_chunks.get_by_id(keys_a[0]) is not None
    assert await second.text_chunks.get_by_id(keys_b[0]) is not None


@pytest.mark.anyio
async def test_a_halted_pipeline_is_not_reported_as_an_indexed_document(tmp_path, monkeypatch):
    """Measured 2026-08-15 on a real ТЗ: the vector flush hit a rate limit,
    LightRAG halted its pipeline and recorded the failure in its own status —
    while the chunks sat in `text_chunks`. Without this check the file is marked
    ingested with no vectors behind it, and that is invisible: the document
    simply never comes back from a search, exactly as if it had nothing to say.
    """
    vault = make_vault(tmp_path)
    rag = await open_stub_index(vault)
    entries = indexed([Chunk(text="Мощность 250 кВт.", locator={"page": 1})])

    original = rag.doc_status.get_by_id

    async def halted(doc_id):
        record = await original(doc_id)
        if record is None:
            return None
        return {**record, "status": "failed"}

    monkeypatch.setattr(rag.doc_status, "get_by_id", halted)

    with pytest.raises(BridgeError) as excinfo:
        await insert_document(rag, source_id="tasks", rel_path="задание.pdf", chunks=entries)

    assert "векторов" in str(excinfo.value)
