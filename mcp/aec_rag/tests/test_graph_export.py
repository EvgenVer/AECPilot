"""Tests for the graph export (task 3J.13).

The graphml is written by networkx in LightRAG's own shape — the attribute
names and the ``<doc>-<chunk>`` keys joined by ``<SEP>`` were read off a real
graph (eval/.graph-cost-vault, 339 nodes).
"""

from __future__ import annotations

import json

import networkx as nx
import pytest
from aec_rag.__main__ import main
from aec_rag.db import open_index
from aec_rag.graph_export import export_graph, graph_file, parse_document
from aec_rag.lightrag_bridge import chunk_key, document_id


def add_chunk(conn, source_id, rel_path, chunk_id):
    conn.execute(
        "INSERT INTO chunks (chunk_id, source_id, rel_path, ordinal, locator, is_table, text) "
        "VALUES (?, ?, ?, 0, '{}', 0, 'текст')",
        (chunk_id, source_id, rel_path),
    )


def key(source_id, rel_path, chunk_id):
    return chunk_key(document_id(source_id, rel_path), chunk_id)


@pytest.fixture
def vault(tmp_path):
    """Three documents; «Заказчик» is in two of them and linked to everything."""
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    conn = open_index(vault / ".aecpilot" / "index.db")
    add_chunk(conn, "s", "ТЗ.docx", "chunk-a")
    add_chunk(conn, "s", "ИГИ/отчёт.pdf", "chunk-b")
    add_chunk(conn, "s", "письмо.pdf", "chunk-c")
    conn.commit()

    graph = nx.Graph()

    def node(name, entity_type, *keys):
        graph.add_node(
            name,
            entity_id=name,
            entity_type=entity_type,
            description=f"Описание: {name}",
            source_id="<SEP>".join(keys),
            file_path="s › ...",
        )

    node(
        "Заказчик",
        "organization",
        key("s", "ТЗ.docx", "chunk-a"),
        key("s", "ИГИ/отчёт.pdf", "chunk-b"),
    )
    node("Свая С-1", "equipment", key("s", "ИГИ/отчёт.pdf", "chunk-b"))
    node("Грунт ИГЭ-2", "content", key("s", "ИГИ/отчёт.pdf", "chunk-b"))
    node("Срок", "content", key("s", "письмо.pdf", "chunk-c"))
    node("Чужая", "content", "doc-0123456789abcdef0123456789abcdef-chunk-zzz")
    graph.add_edge("Заказчик", "Свая С-1", keywords="заказывает", weight=2.0)
    graph.add_edge("Заказчик", "Грунт ИГЭ-2", description="изыскания по участку")
    graph.add_edge("Заказчик", "Срок", keywords="срок сдачи")
    graph.add_edge("Свая С-1", "Грунт ИГЭ-2", keywords="опирается")

    path = graph_file(vault)
    path.parent.mkdir(parents=True)
    nx.write_graphml(graph, path)
    return vault, conn


def by_id(result):
    return {node["id"]: node for node in result["nodes"]}


def test_entities_carry_their_documents_through_chunks(vault):
    vault, conn = vault

    result = export_graph(conn, graph_file(vault))

    nodes = by_id(result)
    assert nodes["Заказчик"]["documents"] == [
        {"source_id": "s", "rel_path": "ТЗ.docx"},
        {"source_id": "s", "rel_path": "ИГИ/отчёт.pdf"},
    ]
    assert nodes["Заказчик"]["type"] == "organization"
    assert nodes["Заказчик"]["degree"] == 3
    # A chunk the index does not know is no document — not a guess.
    assert nodes["Чужая"]["documents"] == []
    assert result["total_nodes"] == 5
    assert result["total_edges"] == 4
    assert result["documents"][0] == {"source_id": "s", "rel_path": "ИГИ/отчёт.pdf", "entities": 3}


def test_edges_and_layout(vault):
    vault, conn = vault

    result = export_graph(conn, graph_file(vault))

    edges = {(e["source"], e["target"]): e for e in result["edges"]}
    edge = edges.get(("Заказчик", "Свая С-1")) or edges[("Свая С-1", "Заказчик")]
    assert edge["label"] == "заказывает"
    assert edge["weight"] == 2.0
    assert len(result["edges"]) == 4
    coordinates = {(node["x"], node["y"]) for node in result["nodes"]}
    assert len(coordinates) == 5
    assert all(-1.0 <= value <= 1.0 for xy in coordinates for value in xy)


def test_the_limit_keeps_the_best_connected(vault):
    vault, conn = vault

    result = export_graph(conn, graph_file(vault), limit=2)

    assert [node["id"] for node in result["nodes"]] == ["Заказчик", "Грунт ИГЭ-2"]
    assert result["truncated"] is True
    assert [(e["source"], e["target"]) for e in result["edges"]] in (
        [("Заказчик", "Грунт ИГЭ-2")],
        [("Грунт ИГЭ-2", "Заказчик")],
    )


def test_the_document_filter_narrows_the_picture(vault):
    vault, conn = vault

    result = export_graph(conn, graph_file(vault), document=("s", "ИГИ/отчёт.pdf"))

    assert sorted(by_id(result)) == ["Грунт ИГЭ-2", "Заказчик", "Свая С-1"]
    assert result["matched_nodes"] == 3
    assert result["truncated"] is False
    assert result["total_nodes"] == 5


def test_no_graph_and_an_empty_graph_are_both_plain_answers(tmp_path):
    vault = tmp_path / "vault"
    assert export_graph(None, graph_file(vault))["graph_exists"] is False

    path = graph_file(vault)
    path.parent.mkdir(parents=True)
    nx.write_graphml(nx.Graph(), path)
    result = export_graph(None, path)
    assert result["graph_exists"] is True
    assert result["nodes"] == []


def test_parse_document():
    assert parse_document("s/ИГИ/отчёт.pdf") == ("s", "ИГИ/отчёт.pdf")
    with pytest.raises(ValueError):
        parse_document("s")


def test_the_cli_prints_the_export(vault, capsys):
    vault, conn = vault
    conn.close()
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps({"schema_version": 1, "sources": [{"id": "s", "root_path": "D:/x"}]}),
        encoding="utf-8",
    )

    code = main(
        ["graph-export", "--project", str(vault), "--limit", "3", "--document", "s/ИГИ/отчёт.pdf"]
    )

    result = json.loads(capsys.readouterr().out)
    assert code == 0
    assert len(result["nodes"]) == 3
    assert result["graph_exists"] is True
