"""Task T78 (UR52): `sources_extract` — the agent reads a source PDF, Word or
Excel file as TEXT without the index.

Before it, the only reader was `sources_read`, which returns the bytes as UTF-8:
for a PDF that is `%PDF-1.4 ...` — the owner's remark 6 on 0.1.0.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from aec_sources.config import SourceRoot
from aec_sources.server import build_server
from docx import Document
from mcp_harness import connected_session

_FIXTURE = Path(__file__).resolve().parents[2] / "aec_rag" / "tests" / "pdf_fixture.py"
_spec = importlib.util.spec_from_file_location("aec_rag_pdf_fixture", _FIXTURE)
pdf_fixture = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pdf_fixture)


def make_root(tmp_path: Path) -> Path:
    root = tmp_path / "Архив КР"
    (root / "Расчёты").mkdir(parents=True)
    (root / "Расчёты" / "отчёт.pdf").write_bytes(
        pdf_fixture.build_text_pdf(
            [["Page one: slab C30/37"], ["Page two: rebar A500"], ["Page three: load 5 kPa"]]
        )
    )
    doc = Document()
    doc.add_heading("Пояснительная записка", level=1)
    doc.add_paragraph("Плита перекрытия толщиной 200 мм.")
    doc.save(root / "записка.docx")
    (root / "заметка.txt").write_text("просто текст", encoding="utf-8")
    (root / "модель.rvt").write_bytes(b"\x00\x01binary")
    return root


def text_of(result) -> str:
    return "\n".join(block.text for block in result.content if hasattr(block, "text"))


@pytest.mark.anyio
async def test_pdf_comes_back_as_page_text_not_bytes(tmp_path):
    server = build_server([SourceRoot(id="src", root_path=str(make_root(tmp_path)))])

    async with connected_session(server) as client:
        result = await client.call_tool(
            "sources_extract", {"source_id": "src", "path": "Расчёты/отчёт.pdf"}
        )

    assert result.is_error is False, text_of(result)
    text = text_of(result)
    assert "%PDF" not in text
    assert "slab C30/37" in text
    assert "rebar A500" in text
    # Every page is labelled, so the agent can cite it.
    assert "[страница 1]" in text
    assert "[страница 3]" in text


@pytest.mark.anyio
async def test_pdf_page_range(tmp_path):
    server = build_server([SourceRoot(id="src", root_path=str(make_root(tmp_path)))])

    async with connected_session(server) as client:
        result = await client.call_tool(
            "sources_extract",
            {"source_id": "src", "path": "Расчёты/отчёт.pdf", "pages": [2, 2]},
        )

    text = text_of(result)
    assert result.is_error is False, text
    assert "rebar A500" in text
    assert "slab C30/37" not in text
    assert "load 5 kPa" not in text
    assert "3" in text  # the page count is reported


@pytest.mark.anyio
async def test_docx_text(tmp_path):
    server = build_server([SourceRoot(id="src", root_path=str(make_root(tmp_path)))])

    async with connected_session(server) as client:
        result = await client.call_tool(
            "sources_extract", {"source_id": "src", "path": "записка.docx"}
        )

    text = text_of(result)
    assert result.is_error is False, text
    assert "Плита перекрытия толщиной 200 мм." in text
    assert "Пояснительная записка" in text


@pytest.mark.anyio
async def test_unsupported_format_is_refused_in_words(tmp_path):
    server = build_server([SourceRoot(id="src", root_path=str(make_root(tmp_path)))])

    async with connected_session(server) as client:
        result = await client.call_tool(
            "sources_extract", {"source_id": "src", "path": "модель.rvt"}
        )

    assert result.is_error is True
    assert ".rvt" in text_of(result)


@pytest.mark.anyio
async def test_traversal_is_refused(tmp_path):
    server = build_server([SourceRoot(id="src", root_path=str(make_root(tmp_path)))])

    async with connected_session(server) as client:
        result = await client.call_tool(
            "sources_extract", {"source_id": "src", "path": "../секрет.pdf"}
        )

    assert result.is_error is True
