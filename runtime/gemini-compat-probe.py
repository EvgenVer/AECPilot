"""Task 3G.1: does Gemini's OpenAI-compatible endpoint serve what our modules need?

Three calls through the plain `openai` SDK at Gemini's OpenAI-compatible address
(D-154 routes aec-rag, Mem0 and image_gen through such an address):
  1. chat completion on the aux model;
  2. embedding — the vector width goes into PLAN (aec-rag's allowlist is keyed on it);
  3. images.generate on the image model — works or not.
Plus, with no network: the names of the base-address fields Mem0's `openai`
provider accepts for `llm` and `embedder`, read from the installed package.

The key is read from the stand profile's .env programmatically and never printed.

Usage: <venv with openai>/python runtime/gemini-compat-probe.py
Exit code: 0 = every check answered (a "not supported" is an answer); 3 = no key.
"""

from __future__ import annotations

import dataclasses
import importlib
import re
import sys
from pathlib import Path

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
CHAT_MODEL = "gemini-3.5-flash-lite"
EMBED_MODEL = "gemini-embedding-2"
IMAGE_MODEL = "gemini-3.1-flash-image"
ENV_FILE = Path(__file__).resolve().parent / "dev-profile" / ".env"


def read_key() -> str | None:
    if not ENV_FILE.is_file():
        return None
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*GEMINI_API_KEY\s*=\s*(.*)", line)
        if m and m.group(1).strip().strip("\"'"):
            return m.group(1).strip().strip("\"'")
    return None


def check(label: str, fn) -> None:
    try:
        print(f"{label}: {fn()}")
    except Exception as exc:  # the probe records failures, it does not raise them
        print(f"{label}: FAILED {type(exc).__name__}: {str(exc)[:300]}")


def mem0_fields() -> str:
    try:
        llm = importlib.import_module("mem0.configs.llms.openai")
        emb = importlib.import_module("mem0.configs.embeddings.base")
    except ImportError as exc:
        return f"mem0 not importable here ({exc})"
    llm_cls = next(
        getattr(llm, n) for n in dir(llm) if n.endswith("Config") and n != "BaseLlmConfig"
    )
    llm_fields = [f for f in _init_params(llm_cls) if "base" in f or "url" in f]
    emb_fields = [f for f in _init_params(emb.BaseEmbedderConfig) if "base" in f or "url" in f]
    return f"llm {llm_cls.__name__}{llm_fields}; embedder BaseEmbedderConfig{emb_fields}"


def _init_params(cls) -> list[str]:
    if dataclasses.is_dataclass(cls):
        return [f.name for f in dataclasses.fields(cls)]
    import inspect

    return list(inspect.signature(cls.__init__).parameters)


def main() -> int:
    print(f"mem0 base-address fields: {mem0_fields()}")
    key = read_key()
    if not key:
        print("GEMINI_API_KEY is not set in the stand profile .env")
        return 3
    from openai import OpenAI

    client = OpenAI(api_key=key, base_url=BASE_URL)

    def chat() -> str:
        r = client.chat.completions.create(
            model=CHAT_MODEL, messages=[{"role": "user", "content": "Reply with the word: ok"}]
        )
        return f"ok, reply={r.choices[0].message.content.strip()[:40]!r}, usage={r.usage}"

    def embed() -> str:
        r = client.embeddings.create(model=EMBED_MODEL, input="проверка ширины вектора")
        return f"ok, width={len(r.data[0].embedding)}"

    def image() -> str:
        r = client.images.generate(model=IMAGE_MODEL, prompt="a small red square", n=1)
        item = r.data[0]
        return f"ok, b64={bool(item.b64_json)}, url={bool(item.url)}"

    check(f"chat {CHAT_MODEL}", chat)
    check(f"embedding {EMBED_MODEL}", embed)
    check(f"images.generate {IMAGE_MODEL}", image)
    return 0


if __name__ == "__main__":
    sys.exit(main())
