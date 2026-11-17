"""Task T80 (UR53): the index builds on a local OpenAI-compatible address that
takes no key (Ollama, LM Studio, llama.cpp `--embeddings`).

Not a mock of the client: a real HTTP server on 127.0.0.1 answers
`/v1/embeddings` the way such a server does, and the shipped embedding function
calls it through the OpenAI client. Checked: the index is built, the vectors
come from that server, and no real key travels there (the placeholder only).
Nothing leaves the machine and nothing is paid.
"""

from __future__ import annotations

import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import pytest
from aec_rag import rag_index
from aec_rag.rag_index import RagSettings, open_index
from mcp_harness import connected_session
from rag_stubs import DIM, _vector, add_scanned, call, forbidden_llm, make_project


class _LocalEmbeddings(BaseHTTPRequestHandler):
    seen: list[dict] = []

    def do_POST(self):  # noqa: N802 - http.server naming
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        type(self).seen.append(
            {"path": self.path, "auth": self.headers.get("Authorization"), "body": body}
        )
        if self.path != "/v1/embeddings":
            self.send_response(404)
            self.end_headers()
            return
        texts = body["input"] if isinstance(body["input"], list) else [body["input"]]
        as_base64 = body.get("encoding_format") == "base64"
        data = []
        for index, text in enumerate(texts):
            vector = _vector(str(text)).astype(np.float32)
            embedding = (
                base64.b64encode(vector.tobytes()).decode() if as_base64 else vector.tolist()
            )
            data.append({"object": "embedding", "index": index, "embedding": embedding})
        payload = json.dumps(
            {
                "object": "list",
                "data": data,
                "model": body.get("model"),
                "usage": {"prompt_tokens": 1, "total_tokens": 1},
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):  # silence the test output
        pass


@pytest.fixture
def local_server():
    _LocalEmbeddings.seen = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _LocalEmbeddings)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.anyio
async def test_index_builds_on_a_local_address_without_a_key(tmp_path, monkeypatch, local_server):
    import aec_rag.ingest as ingest_module
    import aec_rag.server as server_module
    from rag_stubs import _ingest_with_stub_parser, fake_parser

    monkeypatch.setenv("AEC_RAG_BASE_URL", local_server)
    monkeypatch.setenv("AEC_RAG_KEY_ENV", "")
    # A real key in the environment must not travel to the local server.
    monkeypatch.setenv("OPENAI_API_KEY", "настоящий-ключ")

    project_json, source = make_project(tmp_path)
    add_scanned(project_json, source, "ТЗ.pdf", "Трансформатор ТМГ-1000 питает щит ЩС-1")

    server = server_module.build_server(project_json)
    settings = RagSettings(embedding_model="local-embed", embedding_dim=DIM)
    # The shipped embedding function (no `embedding_func=`): it is the one
    # that must reach the address without a key.
    server.rag_state._index = await open_index(
        project_json.parent.parent, settings, llm_func=forbidden_llm
    )
    monkeypatch.setattr(ingest_module, "parse_file", fake_parser)
    monkeypatch.setattr(server_module, "ingest", _ingest_with_stub_parser(ingest_module.ingest))

    async with connected_session(server) as client:
        started = await call(client, "rag_ingest", {})
        job = server.rag_state.jobs[started["job_id"]]
        await job.task
        assert job.status == "done", job.error

    calls = [seen for seen in _LocalEmbeddings.seen if seen["path"] == "/v1/embeddings"]
    assert calls, "the index never asked the local server for vectors"
    assert all(seen["body"]["model"] == "local-embed" for seen in calls)
    auth = {seen["auth"] for seen in calls}
    assert auth == {f"Bearer {rag_index.NO_KEY_PLACEHOLDER}"}, auth
