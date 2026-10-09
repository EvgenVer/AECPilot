"""Why a file did not make it — as a CODE, not as Russian prose (task 3J.7).

The desktop translates the code into the interface language (SPEC UR9, UR44):
until now the reasons were Russian strings written here, and an English
interface showed «failed: источник не подключён». ``detail`` stays what the
library said, word for word — it is the evidence, and it is not translated.

The list is closed: the app has a phrase for every code, and ``unknown`` is the
honest answer for anything this module cannot name.
"""

from __future__ import annotations

SOURCE_DETACHED = "source_detached"
UNSUPPORTED = "unsupported"
FILE_UNREADABLE = "file_unreadable"
PARSE_FAILED = "parse_failed"
OCR_FAILED = "ocr_failed"
NOT_INDEXED = "not_indexed"
PROVIDER_MISSING = "provider_missing"
PROVIDER_KEY = "provider_key"
PROVIDER_LIMIT = "provider_limit"
PROVIDER_UNREACHABLE = "provider_unreachable"
GRAPH_FAILED = "graph_failed"
UNKNOWN = "unknown"

CODES = (
    SOURCE_DETACHED,
    UNSUPPORTED,
    FILE_UNREADABLE,
    PARSE_FAILED,
    OCR_FAILED,
    NOT_INDEXED,
    PROVIDER_MISSING,
    PROVIDER_KEY,
    PROVIDER_LIMIT,
    PROVIDER_UNREACHABLE,
    GRAPH_FAILED,
    UNKNOWN,
)

# Words the providers use for a bad key. Gemini answers 400 «Please pass a valid
# API key» (D-195, measured on the owner's log), OpenAI 401 «Incorrect API key».
_KEY_WORDS = ("api key", "api_key", "apikey", "unauthorized", "permission denied")
_UNREACHABLE_NAMES = ("APIConnectionError", "APITimeoutError", "ConnectTimeout", "ConnectError")


def classify(exc: BaseException, *, default: str = UNKNOWN) -> tuple[str, str]:
    """``(code, detail)`` for an exception raised while indexing one file.

    Provider errors are recognised by their status and class NAME, not by
    importing ``openai``: the classification must not drag a client library
    into code paths (and tests) that never call a provider.
    """
    from aec_rag.parse import ParseError
    from aec_rag.rag_index import RagIndexError

    detail = str(exc) or type(exc).__name__
    if isinstance(exc, RagIndexError):
        return PROVIDER_MISSING, detail
    if isinstance(exc, ParseError):
        return PARSE_FAILED, detail

    status = getattr(exc, "status_code", None)
    lowered = detail.lower()
    if status in (401, 403) or (status == 400 and any(w in lowered for w in _KEY_WORDS)):
        return PROVIDER_KEY, detail
    if status == 429 or "rate limit" in lowered or "resource_exhausted" in lowered:
        return PROVIDER_LIMIT, detail
    if type(exc).__name__ in _UNREACHABLE_NAMES or isinstance(exc, (ConnectionError, TimeoutError)):
        return PROVIDER_UNREACHABLE, detail
    if isinstance(exc, OSError):
        return FILE_UNREADABLE, detail
    return default, detail
