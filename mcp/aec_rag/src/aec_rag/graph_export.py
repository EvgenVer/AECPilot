"""The project's knowledge graph, ready to draw (task 3J.13, SPEC UR44).

The graph LightRAG builds lives in a graphml file nobody could see: the owner
added documents to it and had no way to look at what came out. This module
reads that file, ties every entity to the documents it was extracted from —
through our ``chunks`` table, the same rows a citation points at — and lays the
picture out here, in Python, so the window only draws.

Only reads. A big graph is cut to the ``limit`` best-connected entities: a
picture of thousands of nodes is a grey blot, and the person narrows it by
document instead.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

from aec_rag.lightrag_bridge import split_chunk_key
from aec_rag.rag_index import index_dir, workspace_of

GRAPH_FILE = "graph_chunk_entity_relation.graphml"
#: LightRAG joins the chunk keys of an entity with this (``GRAPH_FIELD_SEP``).
FIELD_SEP = "<SEP>"
DEFAULT_LIMIT = 300
#: networkx lays out up to this many nodes with numpy alone; above it it wants
#: scipy, which is not ours to add for a picture.
MAX_LIMIT = 499
_DESCRIPTION_CHARS = 600
_EDGE_LABEL_CHARS = 120


def graph_file(vault: Path | str) -> Path:
    """Where LightRAG keeps this vault's graph (``NetworkXStorage``)."""
    return index_dir(vault) / workspace_of(vault) / GRAPH_FILE


def empty_export() -> dict[str, Any]:
    return {
        "graph_exists": False,
        "total_nodes": 0,
        "total_edges": 0,
        "matched_nodes": 0,
        "truncated": False,
        "nodes": [],
        "edges": [],
        "documents": [],
    }


def export_graph(
    conn: sqlite3.Connection | None,
    path: Path,
    *,
    limit: int = DEFAULT_LIMIT,
    document: tuple[str, str] | None = None,
) -> dict[str, Any]:
    """Nodes with coordinates and documents, and the edges between them.

    ``document`` keeps only the entities extracted from that file. ``limit``
    keeps the best-connected ones (degree in the whole graph); ``truncated``
    says the picture is not all of it.
    """
    import networkx as nx

    if not path.is_file():
        return empty_export()
    graph = nx.read_graphml(path)
    if graph.number_of_nodes() == 0:
        return {**empty_export(), "graph_exists": True}

    chunk_documents: dict[str, tuple[str, str]] = {}
    if conn is not None:
        for chunk_id, source_id, rel_path in conn.execute(
            "SELECT chunk_id, source_id, rel_path FROM chunks"
        ):
            chunk_documents[chunk_id] = (source_id, rel_path)

    def documents_of(source_field: str) -> list[tuple[str, str]]:
        found: list[tuple[str, str]] = []
        for key in source_field.split(FIELD_SEP):
            parts = split_chunk_key(key.strip())
            doc = chunk_documents.get(parts[1]) if parts else None
            if doc is not None and doc not in found:
                found.append(doc)
        return found

    node_documents = {
        node: documents_of(str(data.get("source_id") or ""))
        for node, data in graph.nodes(data=True)
    }
    per_document = Counter(doc for docs in node_documents.values() for doc in docs)

    candidates = [
        node for node in graph.nodes if document is None or document in node_documents[node]
    ]
    limit = max(1, min(limit, MAX_LIMIT))
    degree = dict(graph.degree())
    picked = sorted(candidates, key=lambda node: (-degree[node], str(node)))[:limit]
    sub = graph.subgraph(picked)
    positions = nx.spring_layout(sub, seed=7) if len(sub) > 1 else {n: (0.0, 0.0) for n in sub}

    nodes = []
    for node in picked:
        data = graph.nodes[node]
        x, y = positions[node]
        nodes.append(
            {
                "id": str(node),
                "label": str(data.get("entity_id") or node),
                "type": str(data.get("entity_type") or ""),
                "description": str(data.get("description") or "")[:_DESCRIPTION_CHARS],
                "degree": degree[node],
                "x": round(float(x), 4),
                "y": round(float(y), 4),
                "documents": [
                    {"source_id": source_id, "rel_path": rel_path}
                    for source_id, rel_path in node_documents[node]
                ],
            }
        )

    edges = []
    for source, target, data in sub.edges(data=True):
        label = str(data.get("keywords") or data.get("description") or "")
        edges.append(
            {
                "source": str(source),
                "target": str(target),
                "label": label[:_EDGE_LABEL_CHARS],
                "weight": float(data.get("weight") or 1.0),
            }
        )

    return {
        "graph_exists": True,
        "total_nodes": graph.number_of_nodes(),
        "total_edges": graph.number_of_edges(),
        "matched_nodes": len(candidates),
        "truncated": len(candidates) > len(picked),
        "nodes": nodes,
        "edges": edges,
        "documents": [
            {"source_id": source_id, "rel_path": rel_path, "entities": count}
            for (source_id, rel_path), count in sorted(
                per_document.items(), key=lambda item: (-item[1], item[0])
            )
        ],
    }


#: A document's code is the start of its file name up to the section mark
#: (task 3L.8): «297-2024-КР Конструктивные решения.pdf» → «297-2024-КР»,
#: «297-1-ИГИ.pdf» → «297-1-ИГИ». A code holds a digit — «Задание-КР» names a
#: kind of document, not one document.
_CODE = re.compile(
    r"^[0-9A-Za-zА-Яа-яЁё.]+(?:-[0-9A-Za-zА-Яа-яЁё.]+)*?-[А-ЯЁ]{2,5}\d*(?:\.\d+)*(?![А-Яа-яЁё])"
)
_DASHES = str.maketrans({dash: "-" for dash in "‐‑‒–—−"})
#: An edge names at most this many shared entities, the best-connected first.
EDGE_ENTITIES = 20
#: …and each entity, or a reference, at most this many places.
_PLACES = 6


def document_code(rel_path: str) -> str | None:
    """The code in a file name, or ``None`` — then the file gets no «ссылается»."""
    match = _CODE.match(Path(rel_path).stem.translate(_DASHES).strip())
    if match is None or not any(char.isdigit() for char in match.group(0)):
        return None
    return match.group(0)


def _locator(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def export_documents(conn: sqlite3.Connection | None, path: Path) -> dict[str, Any]:
    """The graph as a map of documents (task 3L.8, owner decision 2026-10-12).

    A node is a document of the graph. Two documents are linked by the entities
    they share — the edge carries how many (``weight``) and names up to
    ``EDGE_ENTITIES`` of them with the places they come from, so a click on it
    answers «связаны через что». A document is also linked to another whose
    code (from the file name) it mentions: kind ``refers``, from the one that
    mentions to the one mentioned, with the places of the mention.

    Only reads. No layout: the window lays the map out live.
    """
    import networkx as nx

    empty = {"graph_exists": False, "view": "documents", "nodes": [], "edges": []}
    if not path.is_file():
        return empty
    graph = nx.read_graphml(path)
    if conn is None or graph.number_of_nodes() == 0:
        return {**empty, "graph_exists": True}

    chunks: dict[str, tuple[tuple[str, str], dict[str, Any]]] = {}
    for chunk_id, source_id, rel_path, locator in conn.execute(
        "SELECT chunk_id, source_id, rel_path, locator FROM chunks"
    ):
        chunks[chunk_id] = ((source_id, rel_path), _locator(locator))

    def place(chunk_id: str) -> dict[str, Any]:
        (source_id, rel_path), locator = chunks[chunk_id]
        return {
            "source_id": source_id,
            "rel_path": rel_path,
            "chunk_id": chunk_id,
            "locator": locator,
        }

    entities_of: Counter[tuple[str, str]] = Counter()
    # (document a, document b) sorted → [(degree, label, type, chunk ids)]
    shared: dict[tuple[tuple[str, str], tuple[str, str]], list] = {}
    degree = dict(graph.degree())
    for node, data in graph.nodes(data=True):
        by_document: dict[tuple[str, str], list[str]] = {}
        for raw_key in str(data.get("source_id") or "").split(FIELD_SEP):
            parts = split_chunk_key(raw_key.strip())
            if parts and parts[1] in chunks:
                by_document.setdefault(chunks[parts[1]][0], []).append(parts[1])
        entities_of.update(by_document.keys())
        documents = sorted(by_document)
        for i, first in enumerate(documents):
            for second in documents[i + 1 :]:
                shared.setdefault((first, second), []).append(
                    (
                        degree[node],
                        str(data.get("entity_id") or node),
                        str(data.get("entity_type") or ""),
                        by_document[first][: _PLACES // 2] + by_document[second][: _PLACES // 2],
                    )
                )

    documents = set(entities_of)
    has_table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'graph_documents'"
    ).fetchone()
    if has_table:
        documents.update(conn.execute("SELECT source_id, rel_path FROM graph_documents"))

    def node_id(document: tuple[str, str]) -> str:
        return f"{document[0]}/{document[1]}"

    edges: list[dict[str, Any]] = []
    for (first, second), entities in sorted(shared.items(), key=lambda item: -len(item[1])):
        entities.sort(key=lambda entity: (-entity[0], entity[1]))
        edges.append(
            {
                "kind": "shared",
                "source": node_id(first),
                "target": node_id(second),
                "weight": len(entities),
                "entities": [
                    {
                        "label": label,
                        "type": entity_type,
                        "places": [place(chunk_id) for chunk_id in chunk_ids],
                    }
                    for _, label, entity_type, chunk_ids in entities[:EDGE_ENTITIES]
                ],
            }
        )

    codes = {document: document_code(document[1]) for document in documents}
    patterns = {
        document: re.compile(rf"(?<![\w-]){re.escape(code)}(?!\w)")
        for document, code in codes.items()
        if code
    }
    mentions: dict[tuple[tuple[str, str], tuple[str, str]], list[str]] = {}
    if patterns:
        for chunk_id, source_id, rel_path, text in conn.execute(
            "SELECT chunk_id, source_id, rel_path, text FROM chunks ORDER BY ordinal"
        ):
            mentioning = (source_id, rel_path)
            if mentioning not in documents:
                continue
            text = text.translate(_DASHES)
            for mentioned, pattern in patterns.items():
                if mentioned != mentioning and pattern.search(text):
                    mentions.setdefault((mentioning, mentioned), []).append(chunk_id)
    for (mentioning, mentioned), chunk_ids in sorted(mentions.items()):
        edges.append(
            {
                "kind": "refers",
                "source": node_id(mentioning),
                "target": node_id(mentioned),
                "weight": len(chunk_ids),
                "code": codes[mentioned],
                "places": [place(chunk_id) for chunk_id in chunk_ids[:_PLACES]],
            }
        )

    return {
        "graph_exists": True,
        "view": "documents",
        "nodes": [
            {
                "id": node_id(document),
                "source_id": document[0],
                "rel_path": document[1],
                "label": Path(document[1]).name,
                "code": codes[document],
                "entities": entities_of[document],
            }
            for document in sorted(documents)
        ],
        "edges": edges,
    }


def parse_document(value: str) -> tuple[str, str]:
    """``<source_id>/<rel path>`` — the shape every other command takes."""
    source_id, _, rel_path = value.strip().partition("/")
    if not source_id or not rel_path:
        raise ValueError(f"document must be '<source_id>/<relative path>': {value!r}")
    return source_id, rel_path.strip("/")
