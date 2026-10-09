"""Tests for the error codes of aec-rag (task 3J.7).

The desktop words every code in the interface language; these tests pin which
exception lands on which code, so a key refused by Gemini (D-195) says «key»
and not «unknown».
"""

from __future__ import annotations

import pytest
from aec_rag import errors
from aec_rag.errors import classify
from aec_rag.parse import ParseError
from aec_rag.rag_index import RagIndexError


class _Status(Exception):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class APIConnectionError(Exception):
    """Named like the openai client's class — classify goes by the name."""


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (RagIndexError("нет ключа"), errors.PROVIDER_MISSING),
        (ParseError("битый"), errors.PARSE_FAILED),
        (_Status("Incorrect API key provided", 401), errors.PROVIDER_KEY),
        (_Status("forbidden", 403), errors.PROVIDER_KEY),
        (_Status("API key not valid. Please pass a valid API key.", 400), errors.PROVIDER_KEY),
        (_Status("Too many requests", 429), errors.PROVIDER_LIMIT),
        (RuntimeError("RESOURCE_EXHAUSTED: quota"), errors.PROVIDER_LIMIT),
        (APIConnectionError("Connection error."), errors.PROVIDER_UNREACHABLE),
        (TimeoutError("timed out"), errors.PROVIDER_UNREACHABLE),
        (PermissionError("занят другим процессом"), errors.FILE_UNREADABLE),
        (ValueError("что-то иное"), errors.UNKNOWN),
    ],
)
def test_each_exception_lands_on_its_code(exc, code):
    assert classify(exc)[0] == code


def test_a_plain_400_is_not_a_key_error():
    assert classify(_Status("bad request: input too long", 400))[0] == errors.UNKNOWN


def test_detail_is_the_library_text_word_for_word():
    assert classify(ParseError("не удалось разобрать"))[1] == "не удалось разобрать"
    assert classify(ValueError())[1] == "ValueError"


def test_the_default_replaces_unknown_only():
    assert classify(ValueError("x"), default=errors.GRAPH_FAILED)[0] == errors.GRAPH_FAILED
    assert classify(ParseError("x"), default=errors.GRAPH_FAILED)[0] == errors.PARSE_FAILED


def test_every_code_is_in_the_closed_list():
    assert len(set(errors.CODES)) == len(errors.CODES) == 12
