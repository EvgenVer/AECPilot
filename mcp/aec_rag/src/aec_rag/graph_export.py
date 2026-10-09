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


def parse_document(value: str) -> tuple[str, str]:
    """``<source_id>/<rel path>`` — the shape every other command takes."""
    source_id, _, rel_path = value.strip().partition("/")
    if not source_id or not rel_path:
        raise ValueError(f"document must be '<source_id>/<relative path>': {value!r}")
    return source_id, rel_path.strip("/")
