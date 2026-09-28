import pytest

# The provider the desktop app would pass to this server (D-154). Tests stub every
# model call, so these are names only; the key variable deliberately holds a dummy.
TEST_EMBEDDING_MODEL = "test-embedding-model"
TEST_EXTRACTION_MODEL = "test-extraction-model"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def rag_provider_env(monkeypatch):
    monkeypatch.setenv("AEC_RAG_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("AEC_RAG_KEY_ENV", "AEC_RAG_TEST_API_KEY")
    monkeypatch.setenv("AEC_RAG_TEST_API_KEY", "тест")
    monkeypatch.setenv("AEC_RAG_EMBEDDING_MODEL", TEST_EMBEDDING_MODEL)
    monkeypatch.setenv("AEC_RAG_EXTRACTION_MODEL", TEST_EXTRACTION_MODEL)
