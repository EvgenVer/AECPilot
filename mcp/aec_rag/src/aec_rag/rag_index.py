"""Per-project LightRAG index living under ``<vault>/.aecpilot/`` (task 2.8).

Storage is embedded and file-based, per SPECIFICATION C4 («без серверов»): the
index is a directory next to `index.db`, and deleting the vault deletes the
index with it.

The one thing this module guards on its own is the embedding model. Vectors
built by one model mean nothing to another — a switched model does not degrade
the answers, it invalidates the whole index — so the model that built the index
is written down next to it and checked on every open (SPECIFICATION C5).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aec_rag.project_config import ProjectConfigError

if TYPE_CHECKING:
    from lightrag import LightRAG

# The provider is the person's choice, not ours (D-154, SPECIFICATION C5). The
# desktop app resolves it from the agent's own `model.provider` and passes, in
# this server's environment: the OpenAI-compatible address, the NAME of the
# variable holding the key, the embedding model (used when the project does not
# name one) and the extraction model. Nothing here falls back to a provider.
BASE_URL_ENV = "AEC_RAG_BASE_URL"
KEY_ENV_NAME_ENV = "AEC_RAG_KEY_ENV"
EMBEDDING_MODEL_ENV = "AEC_RAG_EMBEDDING_MODEL"
# LightRAG calls an LLM per chunk to pull out entities and relations, so this is
# the model that decides what an ingest costs.
EXTRACTION_MODEL_ENV = "AEC_RAG_EXTRACTION_MODEL"
# Why there is no provider, in words, when the app could not resolve one (task
# 3G.49, D-172): an agent on a subscription has no key this server could use. The
# refusal carries the reason and where to choose, instead of «not set».
UNAVAILABLE_ENV = "AEC_RAG_UNAVAILABLE"


def _no_provider(detail: str) -> RagIndexError:
    """The refusal for a missing provider: the app's reason when it gave one."""
    reason = os.environ.get(UNAVAILABLE_ENV, "").strip()
    return RagIndexError(reason or detail)


# The language entity names are written in (finding D-38).
#
# MEASURED 2026-08-24, and it corrects the finding's own diagnosis. Russian
# documents were producing half-translated, half-transliterated names —
# `Severnaya Site`, `Shumozashchitny Screen`, `Pritychnaya Ustanovka P-1`,
# `Exhaust Unit V-1` beside `Vytyazhnaya Ustanovka V-1` — so one entity landed
# in the graph twice, under two languages, and a duplicate does not merely take
# up room: it splits one entity's relations across two nodes.
#
# The cause is not the model being wilful and not task 5.14 (the agent's reply
# language), which is where the finding sent it. It is a default we never set:
# LightRAG's extraction prompt carries "The entire output (entity names,
# keywords, and descriptions) must be written in `{language}`", the value comes
# from `addon_params["language"]`, and its default is
# `DEFAULT_SUMMARY_LANGUAGE = "English"` (lightrag/constants.py). We passed no
# `addon_params` at all, so the model was being told, on every Russian
# document, to write the output in English — and it obliged, translating some
# names and transliterating others.
#
# Any single value removes the split; Russian is the one this product's readers
# actually read, and it lets their own rule "proper nouns keep their original
# language" work in our favour instead of against it.
EXTRACTION_LANGUAGE = "Russian"

# How patiently an embedding call waits out a rate limit. Seven attempts
# starting at 5 s and doubling to 120 s spans about eight minutes — long
# enough for a per-minute quota to refill several times over.
RATE_LIMIT_ATTEMPTS = 7
RATE_LIMIT_FIRST_WAIT_SECONDS = 5
RATE_LIMIT_MAX_WAIT_SECONDS = 120

_FINGERPRINT_NAME = "aec-index.json"


class RagIndexError(Exception):
    """Raised when the index cannot be opened as configured."""


@dataclass(frozen=True)
class RagSettings:
    embedding_model: str
    # `None` until known: taken from the index fingerprint when the same model
    # built it, otherwise measured with one call when the index is opened. The
    # vector store is created with this number, so it is never guessed.
    embedding_dim: int | None = None
    extraction_model: str = ""
    extraction_language: str = EXTRACTION_LANGUAGE


def index_dir(vault: Path | str) -> Path:
    return Path(vault) / ".aecpilot" / "lightrag"


def workspace_of(vault: Path | str) -> str:
    """LightRAG's isolation key for this vault.

    It is not decoration. LightRAG keeps its shared storage — pipeline status,
    the KV stores, the document register — in **process-global** maps keyed by
    ``(workspace, namespace)``, so two indexes opened in one process with the
    default empty workspace share one document register. Measured 2026-08-15:
    a file called `задание.pdf` in one project then makes `задание.pdf` in the
    next look like a duplicate, and it is silently not indexed.
    """
    digest = hashlib.sha256(str(Path(vault).resolve()).encode()).hexdigest()
    return f"aec-{digest[:16]}"


def load_settings(project_path: Path | str) -> RagSettings:
    """Read the RAG settings out of a vault's ``project.json`` and the provider env.

    An empty or missing ``settings.embedding_model`` means "not chosen for this
    project" and resolves to the provider's embedding model. With neither there
    is nothing to build an index with, and that is said, not guessed.
    """
    path = Path(project_path)
    if path.is_dir():
        path = path / ".aecpilot" / "project.json"
    if not path.is_file():
        raise ProjectConfigError(f"project.json not found: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProjectConfigError(f"project.json is not valid JSON: {path} ({exc})") from exc

    settings = data.get("settings") if isinstance(data, dict) else None
    configured = (settings or {}).get("embedding_model") or ""
    model = configured.strip() or os.environ.get(EMBEDDING_MODEL_ENV, "").strip()
    if not model:
        raise _no_provider(
            "модель эмбеддингов не выбрана: провайдер не задан — выберите его в окне "
            "«Индекс и память» (палитра команд, Ctrl+K)"
        )

    language = ((settings or {}).get("extraction_language") or "").strip() or EXTRACTION_LANGUAGE

    fingerprint = read_fingerprint(path.parent.parent) or {}
    known_dim = fingerprint.get("embedding_dim")
    same_model = fingerprint.get("embedding_model") == model and isinstance(known_dim, int)

    return RagSettings(
        embedding_model=model,
        embedding_dim=known_dim if same_model else None,
        extraction_model=os.environ.get(EXTRACTION_MODEL_ENV, "").strip(),
        extraction_language=language,
    )


def read_fingerprint(vault: Path | str) -> dict[str, Any] | None:
    """What the existing index was built with, or ``None`` if there is none."""
    path = index_dir(vault) / _FINGERPRINT_NAME
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def check_compatible(vault: Path | str, settings: RagSettings) -> None:
    """Refuse to open an index built by a different embedding model.

    The message says what to do, not just what is wrong: a mismatch is only
    fixable by re-indexing everything, and silently answering from vectors of
    another model would look like the product working badly rather than like a
    setting that changed.
    """
    fingerprint = read_fingerprint(vault)
    if fingerprint is None:
        return
    built_with = fingerprint.get("embedding_model")
    if built_with and built_with != settings.embedding_model:
        raise RagIndexError(
            f"индекс построен моделью {built_with!r}, а в настройках {settings.embedding_model!r}: "
            "векторы разных моделей несравнимы, нужен полный повторный ingest"
        )

    # Язык извлечения проверяется по той же причине и с тем же исходом
    # (находка D-38). Дописать в граф, построенный на другом языке, значит
    # завести ВТОРОЕ имя каждой сущности — ровно тот дубль, ради устранения
    # которого язык и задаётся. Молча смешать хуже, чем отказать: расщепление
    # связей по двум узлам человек в ответе не увидит.
    #
    # У индексов, построенных до появления этого поля, его в отпечатке нет.
    # Отсутствие — не расхождение: они собраны английским умолчанием LightRAG,
    # и объявить их несовместимыми задним числом значило бы потребовать
    # повторного ingest у того, кто ничего не менял.
    language_built_with = fingerprint.get("extraction_language")
    if language_built_with and language_built_with != settings.extraction_language:
        raise RagIndexError(
            f"индекс построен с языком извлечения {language_built_with!r}, "
            f"а в настройках {settings.extraction_language!r}: одна сущность получит "
            "два имени на двух языках, нужен полный повторный ingest"
        )


def drop_index(vault: Path | str) -> None:
    """Remove the built index so another embedding model can build it anew (task 3G.7).

    Only derived state goes: the LightRAG directory and the graph's *facts* in
    ``index.db`` («which documents are in the graph» — it dies with the index,
    see ``graph_scope``). The person's *choice* of what the graph should cover
    stays in ``project.json``, so the graph is offered again, priced, after the
    rebuild. Called only on the person's explicit consent.
    """
    import shutil
    import sqlite3

    if index_dir(vault).exists():
        shutil.rmtree(index_dir(vault))
    index_db = Path(vault) / ".aecpilot" / "index.db"
    if index_db.is_file():
        conn = sqlite3.connect(index_db)
        try:
            with conn:
                has_table = conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'graph_documents'"
                ).fetchone()
                if has_table:
                    conn.execute("DELETE FROM graph_documents")
        finally:
            conn.close()


def write_fingerprint(vault: Path | str, settings: RagSettings) -> None:
    directory = index_dir(vault)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / _FINGERPRINT_NAME).write_text(
        json.dumps(
            {
                "embedding_model": settings.embedding_model,
                "embedding_dim": settings.embedding_dim,
                "extraction_model": settings.extraction_model,
                "extraction_language": settings.extraction_language,
                "created_at": datetime.now(UTC).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def api_key() -> str:
    """The provider key, from the process environment and nowhere else.

    The desktop app keeps it in safeStorage and injects it when it spawns this
    server (PLAN rule R2); it is never read from a file here and never written
    to one. Which variable holds it is the provider's, passed by name.
    """
    name = os.environ.get(KEY_ENV_NAME_ENV, "").strip()
    if not name:
        raise _no_provider("провайдер индекса не задан: не указана переменная ключа")
    key = os.environ.get(name, "").strip()
    if not key:
        raise RagIndexError(f"переменная окружения {name} не задана")
    return key


def base_url() -> str:
    """The provider's OpenAI-compatible address (see ``BASE_URL_ENV``)."""
    url = os.environ.get(BASE_URL_ENV, "").strip()
    if not url:
        raise _no_provider("провайдер индекса не задан: не указан адрес")
    return url


async def measure_embedding_dim(model: str) -> int:
    """One embedding call, no width requested: the model's own width.

    Done only when a model builds an index for the first time; the number then
    lives in the fingerprint and is read from there.
    """
    from lightrag.llm.openai import openai_embed

    vectors = await openai_embed.func(
        ["проба ширины вектора"], model=model, api_key=api_key(), base_url=base_url()
    )
    return int(len(vectors[0]))


def _default_embedding_func(settings: RagSettings):
    from lightrag.llm.openai import openai_embed
    from lightrag.utils import EmbeddingFunc

    async def embed_once(texts: list[str], **kwargs: Any):
        # ``.func``, not ``openai_embed`` itself, and ``embedding_dim`` passed
        # explicitly. Their `openai_embed` is decorated into an `EmbeddingFunc`
        # that declares the width of `text-embedding-3-small` and validates
        # every answer against **that** number, whatever model was asked for:
        # calling it from inside another `EmbeddingFunc` is the double
        # decoration their own docstring calls out, and with our 3072-wide
        # model it dies with «expected 10 vectors but got 20» (measured
        # 2026-08-15, task 2.9a). `.func` is the unwrapped implementation —
        # retries included, since `@retry` sits under the wrapper — and
        # `embedding_dim` makes the API return exactly the width the index
        # fingerprint claims.
        return await openai_embed.func(
            texts,
            model=settings.embedding_model,
            api_key=api_key(),
            base_url=base_url(),
            embedding_dim=settings.embedding_dim,
        )

    async def embed(texts: list[str], **kwargs: Any):
        """The same call, but patient with a rate limit.

        Their binding retries three times over about a minute. Measured
        2026-08-15 indexing a real ТЗ: that is not enough on an ordinary account
        — the retries ran out, LightRAG halted the pipeline, and the whole
        document was lost, not just the batch. Indexing is a background job, so
        waiting minutes is free; failing is not.
        """
        from openai import RateLimitError

        delay = RATE_LIMIT_FIRST_WAIT_SECONDS
        for attempt in range(RATE_LIMIT_ATTEMPTS):
            try:
                return await embed_once(texts, **kwargs)
            except RateLimitError:
                if attempt == RATE_LIMIT_ATTEMPTS - 1:
                    raise
                await asyncio.sleep(delay)
                delay = min(delay * 2, RATE_LIMIT_MAX_WAIT_SECONDS)
        raise RagIndexError("недостижимо")  # pragma: no cover

    return EmbeddingFunc(
        embedding_dim=settings.embedding_dim,
        max_token_size=8192,
        model_name=settings.embedding_model,
        func=embed,
    )


def _default_llm_func(settings: RagSettings):
    from lightrag.llm.openai import openai_complete_if_cache

    async def complete(prompt: str, system_prompt: str | None = None, **kwargs: Any) -> str:
        kwargs.pop("hashing_kv", None)
        if not settings.extraction_model:
            raise _no_provider("модель разбора не выбрана: провайдер не задан")
        return await openai_complete_if_cache(
            settings.extraction_model,
            prompt,
            system_prompt=system_prompt,
            api_key=api_key(),
            base_url=base_url(),
            **kwargs,
        )

    return complete


async def open_index(
    vault: Path | str,
    settings: RagSettings,
    *,
    embedding_func: Any | None = None,
    llm_func: Any | None = None,
) -> LightRAG:
    """Open (creating on first use) the vault's index.

    ``embedding_func``/``llm_func`` are injectable so tests can exercise the
    storage layout without calling a paid API — the layout is what this task is
    about, not the model.
    """
    from lightrag import LightRAG
    from lightrag.kg.shared_storage import initialize_pipeline_status

    from aec_rag.lightrag_bridge import ChunkRegistry

    check_compatible(vault, settings)

    if settings.embedding_dim is None:
        dim = (
            embedding_func.embedding_dim
            if embedding_func is not None
            else await measure_embedding_dim(settings.embedding_model)
        )
        settings = replace(settings, embedding_dim=dim)

    directory = index_dir(vault)
    directory.mkdir(parents=True, exist_ok=True)

    # The chunker is ours from the first moment the instance exists (task
    # 2.10a): LightRAG's own chunker would re-cut our chunks by token count and
    # take the locator with it.
    registry = ChunkRegistry()
    rag = LightRAG(
        working_dir=str(directory),
        embedding_func=embedding_func or _default_embedding_func(settings),
        llm_model_func=llm_func or _default_llm_func(settings),
        llm_model_name=settings.extraction_model,
        chunking_func=registry.chunk,
        workspace=workspace_of(vault),
        # Eight concurrent embedding workers is LightRAG's default and it is
        # tuned for a generous account. Measured 2026-08-15 indexing a real ТЗ:
        # the burst tripped the provider's rate limit, the retries ran out, and
        # LightRAG halted the pipeline for the whole document. Indexing is a
        # background job — a person is not sitting in front of it — so trading
        # throughput for finishing at all is the right way round.
        embedding_func_max_async=2,
        embedding_batch_num=8,
        # Owner decision 2026-08-17, task 4D-22. Their default is 1: after the
        # first extraction pass, a second call asks "what else is left", and it
        # carries the entire first answer back into the context. Measured on the
        # mini corpus (eval/reports/gleaning.md): the second pass costs exactly
        # double — 30 LLM calls against 15, 262 674 prompt characters against
        # 127 344 — and returns 47 % more entities. But a good share of that 47 %
        # is the SAME entities under different names: `VRU-1` and
        # `Input-Distribution Device VRU-1`, `Installed Capacity` and
        # `Installed Power`, `Northen Boundary` and `Northern Boundary` (the
        # second is a typo). Duplicates are not merely surplus in a graph: they
        # split one entity's relations across two nodes. Half the price for a
        # graph that is also less fragmented. Re-check with the full eval (task
        # 6.6) — the phase-2 baseline was taken with gleaning on.
        entity_extract_max_gleaning=0,
        # Находка D-38. Без этого LightRAG велит модели писать имена сущностей
        # по-английски (`DEFAULT_SUMMARY_LANGUAGE`), и на русских документах
        # одна сущность попадала в граф дважды: переводом и транслитерацией.
        # Подробности и замер — у константы `EXTRACTION_LANGUAGE`.
        addon_params={"language": settings.extraction_language},
    )
    rag.aec_chunk_registry = registry
    await rag.initialize_storages()
    await initialize_pipeline_status()

    write_fingerprint(vault, settings)
    return rag
