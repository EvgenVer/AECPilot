import json

import pytest
from aec_sources.config import ProjectConfigError, SourceRoot, parse_project_config


def test_parse_project_config_reads_sources(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "Object-X",
                "created_at": "2026-07-14T00:00:00Z",
                "sources": [
                    {
                        "id": "src-1",
                        "root_path": r"\\server\tasks\object-x",
                        "added_at": "2026-07-14T00:00:00Z",
                    },
                    {
                        "id": "src-2",
                        "root_path": "D:/docs",
                        "added_at": "2026-07-14T00:00:00Z",
                    },
                ],
                "settings": {},
            }
        ),
        encoding="utf-8",
    )

    roots = parse_project_config(project_path)

    assert roots == [
        SourceRoot(id="src-1", root_path=r"\\server\tasks\object-x"),
        SourceRoot(id="src-2", root_path="D:/docs"),
    ]


def test_parse_project_config_no_sources_is_valid_empty_list(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps({"schema_version": 1, "name": "Empty", "sources": []}), encoding="utf-8"
    )

    assert parse_project_config(project_path) == []


def test_parse_project_config_missing_file(tmp_path):
    missing = tmp_path / "does-not-exist.json"

    with pytest.raises(ProjectConfigError):
        parse_project_config(missing)


def test_parse_project_config_invalid_json(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)


def test_parse_project_config_missing_sources_field(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(json.dumps({"schema_version": 1, "name": "X"}), encoding="utf-8")

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)


def test_parse_project_config_source_entry_missing_id(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps({"schema_version": 1, "name": "X", "sources": [{"root_path": "D:/docs"}]}),
        encoding="utf-8",
    )

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)


def test_parse_project_config_sources_not_a_list(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps({"schema_version": 1, "name": "X", "sources": {}}), encoding="utf-8"
    )

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)


def test_parse_project_config_source_entry_not_a_dict(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps({"schema_version": 1, "name": "X", "sources": ["not-a-dict"]}),
        encoding="utf-8",
    )

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)


def test_parse_project_config_source_entry_empty_id(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps({"schema_version": 1, "name": "X", "sources": [{"id": "", "root_path": "d"}]}),
        encoding="utf-8",
    )

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)


def test_parse_project_config_source_entry_id_wrong_type(tmp_path):
    project_path = tmp_path / "project.json"
    project_path.write_text(
        json.dumps({"schema_version": 1, "name": "X", "sources": [{"id": 1, "root_path": "d"}]}),
        encoding="utf-8",
    )

    with pytest.raises(ProjectConfigError):
        parse_project_config(project_path)
