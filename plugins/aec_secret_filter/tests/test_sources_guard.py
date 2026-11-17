"""Task T78 (UR52): the agent's file tools never write, delete or move inside a
connected source folder. Reading stays allowed; writing into the vault too.

The owner's rule (interview 2026-11-17): sources are the client's originals —
the program blocks writes there for the agent's file tools; the terminal is
covered by the skill rule.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from aec_secret_filter import sources_guard


@pytest.fixture
def project(tmp_path: Path) -> tuple[Path, Path]:
    vault = tmp_path / "ЮП"
    (vault / ".aecpilot").mkdir(parents=True)
    source = tmp_path / "Архив КР"
    source.mkdir()
    (source / "лист.pdf").write_bytes(b"%PDF")
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps({"sources": [{"id": "s1", "root_path": str(source), "added_at": "x"}]}),
        encoding="utf-8",
    )
    return vault, source


def decide(tool: str, args: dict, vault: Path):
    return sources_guard.before_file_write(
        tool, args, resolve=lambda raw: (vault / raw) if not Path(raw).is_absolute() else Path(raw)
    )


def test_write_into_a_source_is_refused_in_words(project):
    vault, source = project
    verdict = decide("write_file", {"path": str(source / "новый.txt"), "content": "x"}, vault)

    assert verdict is not None
    assert verdict["action"] == "block"
    assert "источник" in verdict["message"]
    assert str(source) in verdict["message"]


def test_patch_on_a_source_file_is_refused(project):
    vault, source = project
    verdict = decide(
        "patch", {"path": str(source / "лист.pdf"), "old_string": "a", "new_string": "b"}, vault
    )
    assert verdict is not None and verdict["action"] == "block"


@pytest.mark.parametrize("header", ["Update File", "Delete File", "Add File"])
def test_v4a_patch_headers_into_a_source_are_refused(project, header):
    vault, source = project
    text = f"*** Begin Patch\n*** {header}: {source / 'лист.pdf'}\n@@\n-a\n+b\n*** End Patch"
    verdict = decide("patch", {"mode": "patch", "patch": text}, vault)
    assert verdict is not None and verdict["action"] == "block"


def test_v4a_move_out_of_vault_into_a_source_is_refused(project):
    vault, source = project
    text = (
        "*** Begin Patch\n*** Update File: notes.md\n"
        f"*** Move to: {source / 'notes.md'}\n@@\n-a\n+b\n*** End Patch"
    )
    verdict = decide("patch", {"mode": "patch", "patch": text}, vault)
    assert verdict is not None and verdict["action"] == "block"


def test_write_into_the_vault_is_allowed(project):
    vault, _ = project
    assert decide("write_file", {"path": "workspace/notes.md", "content": "x"}, vault) is None


def test_reading_a_source_is_not_this_hooks_business(project):
    vault, source = project
    assert decide("read_file", {"path": str(source / "лист.pdf")}, vault) is None


def test_no_project_json_no_block(tmp_path):
    vault = tmp_path / "просто-папка"
    vault.mkdir()
    assert decide("write_file", {"path": str(tmp_path / "x.txt"), "content": "x"}, vault) is None


def test_a_relative_escape_into_the_source_is_refused(project):
    vault, source = project
    verdict = decide("write_file", {"path": f"../{source.name}/лист.pdf", "content": "x"}, vault)
    assert verdict is not None and verdict["action"] == "block"
