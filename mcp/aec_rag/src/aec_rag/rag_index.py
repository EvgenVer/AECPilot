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

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aec_rag.project_config import ProjectConfigError

if TYPE_CHECKING:
    from lightrag import LightRAG

# Chosen 2026-08-14 against the account's own model list. `-large` rather than
# `-small`: it is measurably better on Russian, and switching later costs a full
# re-ingest, so the cheap one is the expensive choice here.
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large"

# Dimensions are not discoverable without calling the API, and the number has to
# be known before the first call — the vector store is created with it.
EMBEDDING_DIMENSIONS = {
    "text-embedding-3-large": 3072,
    "text-embedding-3-small": 1536,
    "text-embedding-ada-002": 1536,
}

# LightRAG calls an LLM per chunk to pull out entities and relations, so this is
# the model that decides what an ingest costs. A dated snapshot on purpose: the
# eval baseline (2.17) has to stay reproducible, and a floating alias would move
# under it.
EXTRACTION_MODEL = "gpt-5.4-mini-2026-03-17"

API_KEY_ENV_VAR = "OPENAI_API_KEY"

_FINGERPRINT_NAME = "aec-index.json"


class RagIndexError(Exception):
    """Raised when the index cannot be opened as configured."""


@dataclass(frozen=True)
class RagSettings:
    embedding_model: str
    embedding_dim: int
    extraction_model: str = EXTRACTION_MODEL


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
    """Read the RAG settings out of a vault's ``project.json``.

    An empty or missing ``settings.embedding_model`` means "not chosen yet" and
    resolves to the default. An unknown one is an error rather than a guess:
    picking a dimension wrongly builds an index that fails on first query.
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
    model = configured.strip() or DEFAULT_EMBEDDING_MODEL

    if model not in EMBEDDING_DIMENSIONS:
        known = ", ".join(sorted(EMBEDDING_DIMENSIONS))
        raise RagIndexError(
            f"неизвестная embedding-модель {model!r} в {path}; известные: {known}"
        )

    return RagSettings(embedding_model=model, embedding_dim=EMBEDDING_DIMENSIONS[model])


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


def write_fingerprint(vault: Path | str, settings: RagSettings) -> None:
    directory = index_dir(vault)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / _FINGERPRINT_NAME).write_text(
        json.dumps(
            {
                "embedding_model": settings.embedding_model,
                "embedding_dim": settings.embedding_dim,
                "extraction_model": settings.extraction_model,
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
    to one.
    """
    key = os.environ.get(API_KEY_ENV_VAR, "").strip()
    if not key:
        raise RagIndexError(f"переменная окружения {API_KEY_ENV_VAR} не задана")
    return key


def _default_embedding_func(settings: RagSettings):
    from lightrag.llm.openai import openai_embed
    from lightrag.utils import EmbeddingFunc

    async def embed(texts: list[str], **kwargs: Any):
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
            embedding_dim=settings.embedding_dim,
        )

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
        return await openai_complete_if_cache(
            settings.extraction_model,
            prompt,
            system_prompt=system_prompt,
            api_key=api_key(),
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
    )
    rag.aec_chunk_registry = registry
    await rag.initialize_storages()
    await initialize_pipeline_status()

    write_fingerprint(vault, settings)
    return rag
