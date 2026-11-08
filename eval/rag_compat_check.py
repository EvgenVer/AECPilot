"""An index built by one LightRAG version is read by another (task T56). Free: the
model and the embeddings are the test stubs (`mcp/aec_rag/tests/rag_stubs.py`).

Run before a LightRAG lift, from the repository root, into a temporary folder:

    uv run --with "lightrag-hku==<old>" python eval/rag_compat_check.py \
        build <dir> mcp/aec_rag/tests
    uv run python eval/rag_compat_check.py read <dir> mcp/aec_rag/tests

`read` prints the old document's status, whether its chunk and graph are found, and whether
a new document indexes on top. 2026-11-08, 1.5.6 → 1.5.7: processed, found, 2 nodes, the new
one processed and found, the old one still found.
"""

import asyncio
import importlib.metadata as md
import json
import sys
from pathlib import Path

mode, work, tests = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
sys.path.insert(0, tests)

from rag_stubs import extracting_llm, word_embedding  # noqa: E402

TEXT_A = "Щит ВРУ-1 питает систему электроснабжения. Установленная мощность щита 120 кВт."
TEXT_B = "Насосная станция получает питание от щита ВРУ-2 мощностью 45 кВт."


async def main():
    from lightrag import LightRAG, QueryParam
    from lightrag.kg.shared_storage import initialize_pipeline_status

    calls: list[str] = []
    rag = LightRAG(
        working_dir=str(work),
        workspace="compat",
        embedding_func=word_embedding(),
        llm_model_func=extracting_llm(calls),
        entity_extract_max_gleaning=0,
    )
    await rag.initialize_storages()
    await initialize_pipeline_status()
    out = {"lightrag": md.version("lightrag-hku")}
    if mode == "build":
        await rag.ainsert(TEXT_A, ids=["doc-a"], file_paths=["a.md"])
    else:
        status = await rag.doc_status.get_by_id("doc-a")
        out["doc_a_status"] = (status or {}).get("status")
        ctx = await rag.aquery(
            "мощность щита", param=QueryParam(mode="naive", only_need_context=True)
        )
        out["naive_context_has_old_chunk"] = "120 кВт" in str(ctx)
        graph = await rag.get_knowledge_graph("*", max_depth=2)
        out["old_graph_nodes"] = len(graph.nodes)
        await rag.ainsert(TEXT_B, ids=["doc-b"], file_paths=["b.md"])
        status_b = await rag.doc_status.get_by_id("doc-b")
        out["doc_b_status"] = (status_b or {}).get("status")
        ctx2 = await rag.aquery(
            "насосная станция", param=QueryParam(mode="naive", only_need_context=True)
        )
        out["new_insert_found"] = "45 кВт" in str(ctx2)
        out["old_still_found"] = "120 кВт" in str(
            await rag.aquery(
                "мощность щита", param=QueryParam(mode="naive", only_need_context=True)
            )
        )
    await rag.finalize_storages()
    print(json.dumps(out, ensure_ascii=False, default=str))


asyncio.run(main())
