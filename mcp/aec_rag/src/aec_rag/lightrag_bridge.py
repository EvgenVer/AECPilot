"""Putting *our* chunks into LightRAG without losing their locator (task 2.10a).

LightRAG chunks documents itself and names the chunks itself. Ours carry the
locator — the page, sheet or heading a citation has to name — so the whole job
of this module is to make LightRAG store our chunks under our ids, and to make
the way back from a search hit to that locator an exact lookup rather than a
guess.

Two of their extension points make it possible, both deliberate:

* ``chunking_func`` — the legacy chunker hook. It is invoked whenever a
  document's ``process_options`` does not name a chunking strategy, which is
  exactly our case (we pass either nothing or ``!``).
* an explicit ``chunk_id`` on the dict a chunker returns:
  ``utils_pipeline.build_chunks_dict_from_chunking_result`` prefers it over its
  own positional name, prefixing it with the document id.

The one awkward part is that the hook receives the document *content* and
nothing else — no document id — so the chunks it has to hand back are looked up
by that content. Their pipeline sanitizes content before storing it, so we
register the *already sanitized* text and pass exactly that as the document,
which makes their sanitize a no-op and the lookup exact. A lookup that misses
raises instead of falling back to their chunker: a silent fallback would index
the document perfectly well and lose every locator in it, and the loss would
only surface much later, as citations that cannot open anything.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from lightrag import LightRAG

# Their flag for "index this document but do not extract entities from it"
# (`lightrag.constants.PROCESS_OPTION_SKIP_KG`). Repeated here rather than
# imported at module scope so importing this module stays cheap; the value is
# asserted against theirs in the tests.
SKIP_KG = "!"


class BridgeError(RuntimeError):
    """Raised when a document cannot be handed to LightRAG as our chunks."""


@dataclass(frozen=True)
class IndexedChunk:
    """A chunk as it is already stored in ``index.db``: our id plus its text."""

    chunk_id: str
    text: str


def document_id(source_id: str, rel_path: str) -> str:
    """A stable LightRAG document id for a file.

    Derived from where the file is, not from what it contains: re-ingesting an
    edited file has to *replace* the old document, and a content-derived id
    would quietly create a second one.
    """
    digest = hashlib.sha256(f"{source_id}\x00{rel_path}".encode()).hexdigest()
    return f"doc-{digest[:32]}"


def chunk_key(doc_id: str, chunk_id: str) -> str:
    """The key LightRAG will store our chunk under.

    Mirrors ``build_chunks_dict_from_chunking_result``: an explicit ``chunk_id``
    is used as is when it already starts with ``<doc_id>-``, and prefixed
    otherwise. Ours never does, so the key is always the prefixed form.
    """
    return chunk_id if chunk_id.startswith(f"{doc_id}-") else f"{doc_id}-{chunk_id}"


def lightrag_file_path(source_id: str, rel_path: str) -> str:
    """The name LightRAG files this document under — the whole path, flattened.

    Their duplicate check compares ``Path(file_path).name``: the **basename**.
    A design project has `ЭОМ/Задание.pdf`, `ОВ/Задание.pdf` and `ВК/Задание.pdf`,
    and under that rule the second and third are «duplicates» and are silently
    not indexed (measured 2026-08-15). Flattening the separators makes the
    basename the full path, which is unique by construction and still readable
    in their logs.
    """
    flat = rel_path.replace("\\", "/").replace("/", " › ")
    return f"{source_id} › {flat}"


def document_content(source_id: str, rel_path: str, chunks: Sequence[IndexedChunk]) -> str:
    """The document text handed to LightRAG: an origin line, then our chunks.

    The origin line is not cosmetic. Their second duplicate check hashes the
    body, so two identical files — the same PDF copied into two folders, which
    is ordinary in a design project — would collide and one of them would not be
    indexed. Naming the file inside the text makes every document distinct.
    """
    body = "\n\n".join(chunk.text for chunk in chunks)
    return f"<!-- {lightrag_file_path(source_id, rel_path)} -->\n\n{body}"


_DOC_ID_LENGTH = len("doc-") + 32


def split_chunk_key(key: str) -> tuple[str, str] | None:
    """Inverse of :func:`chunk_key`, or ``None`` if the key is not shaped like one.

    Their own chunk names (``<doc_id>-chunk-000``) come apart the same way —
    telling ours from theirs is the caller's business, and a caller that fails
    to find the id in ``index.db`` has its answer.
    """
    if len(key) <= _DOC_ID_LENGTH or not key.startswith("doc-"):
        return None
    doc_id = key[:_DOC_ID_LENGTH]
    separator = key[_DOC_ID_LENGTH]
    chunk_id = key[_DOC_ID_LENGTH + 1 :]
    if separator != "-" or not chunk_id:
        return None
    return doc_id, chunk_id


def _stable_sanitized(text: str) -> str:
    """Their ``sanitize_text_for_encoding`` applied to a fixed point.

    It is not idempotent in general — it runs ``html.unescape``, so ``&amp;amp;``
    becomes ``&amp;`` and then ``&`` — and the pipeline applies it again to
    whatever we pass in. Registering the fixed point makes their pass a no-op,
    so the content the chunker hook receives is character-for-character the
    content we registered.
    """
    from lightrag.utils import sanitize_text_for_encoding

    for _ in range(8):
        nxt = sanitize_text_for_encoding(text)
        if nxt == text:
            return text
        text = nxt
    raise BridgeError("текст документа не стабилизируется под санитайзером LightRAG")


class ChunkRegistry:
    """Content → our chunks, read by the chunking hook.

    Registrations are kept until :meth:`forget` — a pipeline run may process
    several enqueued documents, and which of them it reaches when is theirs to
    decide, not ours.
    """

    def __init__(self) -> None:
        self._by_content: dict[str, list[IndexedChunk]] = {}

    def register(self, chunks: Sequence[IndexedChunk], content: str) -> str:
        """Register ``chunks`` under ``content``; returns the text to enqueue."""
        if not chunks:
            raise BridgeError("нечего индексировать: у документа нет чанков")
        stable = _stable_sanitized(content)
        if not stable:
            raise BridgeError("нечего индексировать: текст документа пуст")
        self._by_content[stable] = list(chunks)
        return stable

    def forget(self, content: str) -> None:
        self._by_content.pop(content, None)

    def chunk(
        self,
        tokenizer: Any,
        content: str,
        split_by_character: str | None = None,
        split_by_character_only: bool = False,
        chunk_overlap_token_size: int = 0,
        chunk_token_size: int = 0,
        **_kwargs: Any,
    ) -> list[dict[str, Any]]:
        """The ``chunking_func`` LightRAG calls. Our chunks, our ids, verbatim.

        The size arguments are ignored on purpose: chunk boundaries are decided
        by :mod:`aec_rag.chunk`, where a table is kept whole and a locator is
        attached, and re-cutting them here by token count would undo both.
        """
        chunks = self._by_content.get(content)
        if chunks is None:
            raise BridgeError(
                "LightRAG попросил разбить текст, которого мы не регистрировали — "
                "чанки и их locator'ы были бы потеряны"
            )
        return [
            {
                "content": chunk.text,
                "chunk_order_index": ordinal,
                "chunk_id": chunk.chunk_id,
                "tokens": len(tokenizer.encode(chunk.text)) if tokenizer is not None else 0,
            }
            for ordinal, chunk in enumerate(chunks)
        ]


def attach_registry(rag: LightRAG) -> ChunkRegistry:
    """Route ``rag``'s chunking through a fresh registry and return it."""
    registry = ChunkRegistry()
    rag.chunking_func = registry.chunk
    rag.aec_chunk_registry = registry
    return registry


def registry_of(rag: LightRAG) -> ChunkRegistry:
    registry = getattr(rag, "aec_chunk_registry", None)
    if registry is None:
        return attach_registry(rag)
    return registry


async def insert_document(
    rag: LightRAG,
    *,
    source_id: str,
    rel_path: str,
    chunks: Sequence[IndexedChunk],
    build_graph: bool = False,
) -> list[str]:
    """Put one document's chunks into the index; return their LightRAG keys.

    ``build_graph=False`` is level 1 of SPECIFICATION UR24: vectors and nothing
    else, not a single LLM call, which is what makes indexing everything
    affordable. ``True`` is level 2 and costs an extraction call per chunk.

    An index that already holds exactly these chunks in exactly this mode is
    left alone — a full re-ingest of an unchanged file must not pay for its
    embeddings twice. Otherwise the old document is deleted before the new one
    goes in: re-ingest happens because the file changed, and adding to it would
    leave the previous edition's paragraphs to be retrieved and cited as
    current.
    """
    doc_id = document_id(source_id, rel_path)
    options = "" if build_graph else SKIP_KG
    keys = [chunk_key(doc_id, chunk.chunk_id) for chunk in chunks]

    if await _already_holds(rag, doc_id, keys, options):
        return keys

    registry = registry_of(rag)
    content = registry.register(chunks, document_content(source_id, rel_path, chunks))
    try:
        existing = await rag.adelete_by_doc_id(doc_id)
        if existing.status not in ("success", "not_found"):
            raise BridgeError(
                f"не удалось заменить документ {doc_id} в индексе: {existing.message}"
            )
        await rag.apipeline_enqueue_documents(
            content,
            ids=[doc_id],
            file_paths=[lightrag_file_path(source_id, rel_path)],
            process_options=options,
        )
        await rag.apipeline_process_enqueue_documents()
    finally:
        registry.forget(content)

    await _verify_stored(rag, doc_id, keys)
    return keys


def _record_field(record: Any, name: str, default: Any = None) -> Any:
    if isinstance(record, dict):
        return record.get(name, default)
    return getattr(record, name, default)


async def _already_holds(
    rag: LightRAG, doc_id: str, keys: Sequence[str], options: str
) -> bool:
    """Is this exact document, chunk for chunk, already in the index as asked?

    The chunk set has to match exactly, not merely contain ours: a shortened
    document — a page removed from the edition — would otherwise leave the
    dropped page in the index, still findable and still quotable.

    ``options`` is part of the comparison because a document indexed at tier 1
    holds the same chunks as one indexed with a graph; skipping on the chunks
    alone would make «add this folder to the graph» a silent no-op.
    """
    record = await rag.doc_status.get_by_id(doc_id)
    if not record:
        return False
    status = str(_record_field(record, "status", "")).lower().rsplit(".", 1)[-1]
    if status != "processed":
        return False
    stored = _record_field(record, "chunks_list") or []
    metadata = _record_field(record, "metadata") or {}
    return set(stored) == set(keys) and str(metadata.get("process_options") or "") == options


async def _verify_stored(rag: LightRAG, doc_id: str, keys: Sequence[str]) -> None:
    """Confirm the index holds our chunks under our keys, and say so if not.

    LightRAG has one last guard of its own before embedding: a chunk over the
    embedding window is window-split by token count, which renames it (`…-s12`)
    and detaches it from the locator in ``index.db``. Measured 2026-08-15 on a
    real ТЗ that Docling renders as a single 150 000-token table — the chunker
    now cuts such a table itself, and this check is what keeps a future
    regression from being silent: an index that works and cites nothing looks
    fine right up to the first click on a citation.
    """
    stored = await rag.text_chunks.get_by_ids(list(keys))
    missing = [key for key, value in zip(keys, stored, strict=True) if value is None]
    if missing:
        raise BridgeError(
            f"документ {doc_id}: {len(missing)} из {len(keys)} чанков сохранены не под нашими "
            f"идентификаторами — locator'ы потеряны (первый: {missing[0]})"
        )

    # …and that the run actually finished. Measured 2026-08-15 on a real ТЗ: the
    # vector flush hit a rate limit, LightRAG halted the pipeline and recorded
    # the failure in its own status — while the chunks sat in `text_chunks` and
    # this check passed. The file was then marked ingested with no vectors
    # behind it, which is invisible: the document simply never comes back from a
    # search, exactly as if it had nothing to say.
    record = await rag.doc_status.get_by_id(doc_id)
    status = str(_record_field(record, "status", "")).lower().rsplit(".", 1)[-1] if record else ""
    if status != "processed":
        raise BridgeError(
            f"документ {doc_id}: конвейер LightRAG завершился со статусом {status or 'неизвестно'} "
            "— чанки есть, а векторов за ними нет; файл останется непроиндексированным"
        )


async def delete_document(rag: LightRAG, doc_id: str) -> bool:
    """Remove a document from the index. ``False`` if it was not there."""
    result = await rag.adelete_by_doc_id(doc_id)
    if result.status == "not_found":
        return False
    if result.status != "success":
        raise BridgeError(f"не удалось удалить документ {doc_id} из индекса: {result.message}")
    return True
