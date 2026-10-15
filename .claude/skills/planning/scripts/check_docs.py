"""Read-only structural checks and a derived view of canonical project documents.

No project commands, imports, model calls, recursive scans, or document rewrites.
Recorded evidence and permission statements still require human/agent judgment.
"""
from __future__ import annotations

import argparse
from collections import deque
import json
import os
from pathlib import Path
import re
import stat
import sys


SECTIONS = {
    "DESCRIPTION.md": ["Purpose", "Audience", "Context"],
    "SPECIFICATION.md": ["Requirements", "Constraints and non-goals", "Acceptance"],
    "PLAN.md": ["Phases", "Technical decisions", "Verification"],
    "TASKS.md": ["Current", "Tasks"],
}
CURRENT_FIELDS = (
    "Execution scope", "Authorization source", "Current phase", "Current task",
    "Next checkpoint", "Resume note",
)
TASK_ID = re.compile(r"T([1-9][0-9]*)(?:\.([1-9][0-9]*))?\Z")
PHASE_ID = re.compile(r"[1-9][0-9]*\Z")
RESULT = re.compile(
    r"Check:\s*(.+?);\s*Result:\s*(pending|passed|failed|unverified)"
    r"(?:\s+[—-]\s+(.+))?\Z"
)
STATUSES = {"todo", "doing", "blocked", "done", "cancelled"}
MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
PROTECTED_COMPONENTS = {"secrets", ".ssh", ".aws", ".azure", "gcloud", "credentials", "credential-store", "token-store"}


def linked(path: Path) -> bool:
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def read_document(root: Path, name: str) -> str:
    """Read only a fixed allowlisted filename, rejecting link/redirected contents."""
    if name not in SECTIONS:
        raise ValueError("Document is not in the checker allowlist")
    for component in root.parts:
        normalized = component.rstrip(" .").casefold()
        if (normalized in PROTECTED_COMPONENTS or normalized.startswith((".env", "id_rsa"))
                or normalized.endswith((".pem", ".key", ".p12"))):
            raise ValueError("Project path enters a protected directory or credential area")
    for parent in (root, *root.parents):
        if linked(parent):
            raise ValueError("Project path contains a symbolic link or junction")
    path = root / name
    info = path.lstat()
    if linked(path) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError("Document must be an ordinary file, not a link or special file")
    if info.st_size > MAX_DOCUMENT_BYTES:
        raise ValueError("Document exceeds the 4 MiB read limit; inspect it separately")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    with os.fdopen(os.open(path, flags), "rb") as handle:
        opened = os.fstat(handle.fileno())
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError("Document changed while opening; retry a stable document state")
        data = handle.read(MAX_DOCUMENT_BYTES + 1)
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ValueError("Document exceeds the read limit")
    return data.decode("utf-8-sig")


def visible_lines(text: str) -> list[tuple[int, str]]:
    text = re.sub(r"<!--.*?-->", lambda m: "\n" * m[0].count("\n"), text, flags=re.S)
    result = []
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        match = re.match(r"(`{3,}|~{3,})", stripped)
        if match:
            marker = match[1]
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None:
            result.append((number, stripped))
    return result


def filled(value: str) -> bool:
    return bool(value.strip()) and not re.fullmatch(r"<[^>]+>", value.strip())


def inspect_project(root: Path | str) -> dict:
    root = Path(root).absolute()
    diagnostics: list[dict] = []
    docs: dict[str, list[tuple[int, str]]] = {}
    phases: list[dict] = []
    tasks: list[dict] = []
    current: dict[str, str] = {}
    details: dict[str, str] = {}
    mappings: list[tuple[int, str]] = []

    def issue(file: str, line: int, message: str, level: str = "error") -> None:
        diagnostics.append(dict(level=level, file=file, line=line, message=message))

    for name, required in SECTIONS.items():
        try:
            docs[name] = lines = visible_lines(read_document(root, name))
        except (OSError, UnicodeError, ValueError) as exc:
            issue(name, 1, f"Cannot read canonical document: {type(exc).__name__}. "
                  "Check existence, UTF-8 encoding, and ordinary-file ownership.")
            continue
        titles = [(n, s) for n, s in lines if s.startswith("# ")]
        if len(titles) != 1 or not titles[0][1].startswith(f"# {name[:-3]} — "):
            issue(name, 1, f"Use the canonical '# {name[:-3]} — project name' title")
        elif not filled(titles[0][1].split(" — ", 1)[1]):
            issue(name, titles[0][0], "Replace the project-name placeholder")
        headings = [(n, s[3:]) for n, s in lines if s.startswith("## ")]
        actual = [s for _, s in headings]
        allowed = [required, required + ["Proposals"]] if name == "TASKS.md" else [required]
        if actual not in allowed:
            issue(name, 1, "Use the canonical sections in order: " + "; ".join(required)
                  + ("; optional Proposals" if name == "TASKS.md" else "")
                  + ". For legacy documents, follow README's existing-project update procedure.")
        for index, (number, heading) in enumerate(headings):
            end = headings[index + 1][0] if index + 1 < len(headings) else float("inf")
            body = [s for n, s in lines if number < n < end and s]
            if not body or all(not filled(s) for s in body):
                issue(name, number, f"Section {heading} needs actual content, not an empty template")

    def references(value: str, pattern: re.Pattern, file: str, number: int) -> list[str]:
        if value == "none":
            return []
        items = [v.strip() for v in value.split(",")]
        if not items or any(not pattern.fullmatch(v) for v in items) or len(set(items)) != len(items):
            issue(file, number, "Use unique comma-separated canonical IDs, or none")
            return []
        return items

    def table(lines: list[tuple[int, str]], start: int, header: list[str], file: str):
        rows = []
        index = start
        while index < len(lines) and lines[index][1].startswith("|"):
            number, source = lines[index]
            cells = [v.strip() for v in re.split(r"(?<!\\)\|", source)[1:-1]]
            cells = [v.replace(r"\|", "|") for v in cells]
            if not source.endswith("|") or len(cells) != len(header):
                issue(file, number, f"Expected {len(header)} table columns; escape literal pipes")
            elif index == start and cells != header:
                issue(file, number, "Use canonical columns: " + ", ".join(header))
            elif index == start + 1:
                if not all(re.fullmatch(r":?-{3,}:?", v) for v in cells):
                    issue(file, number, "Add a Markdown table separator after the header")
            elif index > start + 1:
                if not all(filled(v) for v in cells):
                    issue(file, number, "Replace empty cells and template placeholders")
                rows.append((number, cells))
            index += 1
        if not rows:
            issue(file, lines[start][0], "A present task/phase/mapping table needs at least one row")
        return rows, index

    section = None
    table_count = 0
    lines = docs.get("PLAN.md", [])
    index = 0
    while index < len(lines):
        number, line = lines[index]
        if line.startswith("## "):
            section = line[3:]
        elif line.startswith("### "):
            if section != "Technical decisions" or line != "### Integrations":
                issue("PLAN.md", number, "Only the conditional Integrations subsection belongs here")
        elif line.startswith("|") and section == "Phases":
            table_count += 1
            rows, index = table(lines, index, ["Phase", "Outcome", "After", "Completion check"], "PLAN.md")
            for row_number, cells in rows:
                identifier, outcome, after, check = cells
                if not PHASE_ID.fullmatch(identifier):
                    issue("PLAN.md", row_number, "Phase IDs are positive whole numbers without prefixes")
                    continue
                phases.append(dict(id=identifier, outcome=outcome, after=references(after, PHASE_ID, "PLAN.md", row_number),
                                   check=check, line=row_number))
            continue
        index += 1
    if table_count != 1 and "PLAN.md" in docs:
        issue("PLAN.md", 1, "Phases must contain exactly one canonical phase table")

    phase = None
    section = None
    groups: list[str] = []
    task_table_phases: list[str] = []
    lines = docs.get("TASKS.md", [])
    index = 0
    while index < len(lines):
        number, line = lines[index]
        if line.startswith("## "):
            section, phase = line[3:], None
        elif section == "Current" and line.startswith("- "):
            parts = line[2:].split(":", 1)
            if len(parts) != 2 or parts[0] not in CURRENT_FIELDS:
                issue("TASKS.md", number, "Use only the canonical Current fields")
            else:
                key, value = parts[0], parts[1].strip()
                if key in current:
                    issue("TASKS.md", number, "Current fields must not be repeated")
                if not filled(value):
                    issue("TASKS.md", number, "Replace the Current field placeholder")
                current[key] = value
        elif section == "Tasks" and line.startswith("### "):
            match = re.fullmatch(r"### Phase ([1-9][0-9]*)", line)
            if match:
                phase = match[1]
                groups.append(phase)
            elif line == "### ID changes":
                phase = "mapping"
            else:
                issue("TASKS.md", number, "Use Phase N subsections, with ID changes only for migration")
                phase = None
        elif section == "Tasks" and line.startswith("|"):
            if phase == "mapping":
                rows, index = table(lines, index, ["Previous reference", "Current reference"], "TASKS.md")
                mappings.extend((n, values[1]) for n, values in rows)
            elif phase is not None:
                task_table_phases.append(phase)
                rows, index = table(lines, index, ["ID", "Task", "Status", "After", "Verification"], "TASKS.md")
                for row_number, cells in rows:
                    identifier, description, status, after, verification = cells
                    if not TASK_ID.fullmatch(identifier):
                        issue("TASKS.md", row_number, "Use task IDs T1, T2, or one-level insertions such as T7.1")
                        continue
                    if status not in STATUSES:
                        issue("TASKS.md", row_number, "Status must be todo, doing, blocked, done, or cancelled")
                    match = RESULT.fullmatch(verification)
                    result, evidence = "invalid", ""
                    if not match or not filled(match[1]):
                        issue("TASKS.md", row_number, "Verification needs Check: method/outcome; Result: pending/passed/failed/unverified")
                    else:
                        result, evidence = match[2], match[3] or ""
                        if result != "pending" and not filled(evidence):
                            issue("TASKS.md", row_number, "A recorded result needs evidence or an explanation of what is unavailable")
                        if status == "done" and result == "unverified":
                            issue("TASKS.md", row_number, f"{identifier} reports completion without verified evidence; resolve before relying on it", "warning")
                        elif status == "done" and result != "passed":
                            issue("TASKS.md", row_number, "Done requires a passed check, or explicit unverified historical evidence")
                    tasks.append(dict(id=identifier, task=description, status=status, after=references(after, TASK_ID, "TASKS.md", row_number),
                                      verification=verification, result=result, evidence=evidence, phase=phase, line=row_number))
            else:
                issue("TASKS.md", number, "Task tables belong under a Phase N subsection")
                index += 1
            continue
        elif section == "Tasks":
            match = re.match(r"- (T[1-9][0-9]*(?:\.[1-9][0-9]*)?):\s*(.+)", line)
            if match:
                details[match[1]] = details.get(match[1], "") + " " + match[2]
        index += 1

    if "TASKS.md" in docs and list(current) != list(CURRENT_FIELDS):
        issue("TASKS.md", 1, "Current fields must appear once in template order: " + ", ".join(CURRENT_FIELDS))
    if len(groups) != len(set(groups)) or len(task_table_phases) != len(set(task_table_phases)):
        issue("TASKS.md", 1, "Each decomposed phase has one subsection and one task table")
    if groups != task_table_phases:
        issue("TASKS.md", 1, "Decompose every present phase into its task table; leave future phases in PLAN")

    phase_by_id = {p["id"]: p for p in phases}
    task_by_id = {t["id"]: t for t in tasks}
    if len(phase_by_id) != len(phases):
        issue("PLAN.md", 1, "Phase IDs must be unique")
    if len(task_by_id) != len(tasks):
        issue("TASKS.md", 1, "Task IDs must be unique across the entire project")
    if [p["id"] for p in phases] != [str(i) for i in range(1, len(phases) + 1)]:
        issue("PLAN.md", 1, "List phases sequentially as 1, 2, 3, ...")
    if any(group not in phase_by_id for group in groups):
        issue("TASKS.md", 1, "Every task phase must exist in PLAN")
    if groups != sorted(groups, key=int):
        issue("TASKS.md", 1, "Keep decomposed phases in PLAN order")
    order = lambda identifier: tuple(int(v or 0) for v in TASK_ID.fullmatch(identifier).groups())
    if [t["id"] for t in tasks] != sorted((t["id"] for t in tasks), key=order):
        issue("TASKS.md", 1, "Keep task IDs in numeric execution order, including numeric insertion suffixes")

    def validate_graph(items: list[dict], by_id: dict, filename: str) -> None:
        positions = {item["id"]: i for i, item in enumerate(items)}
        successors = {identifier: [] for identifier in by_id}
        incoming = {identifier: 0 for identifier in by_id}
        for item in items:
            for dependency in item["after"]:
                if dependency not in by_id:
                    issue(filename, item["line"], f"{item['id']} references a missing prerequisite")
                    continue
                if positions[dependency] >= positions[item["id"]]:
                    issue(filename, item["line"], "Place prerequisites before dependent work in the sequence")
                successors[dependency].append(item["id"])
                incoming[item["id"]] += 1
        queue = deque(identifier for identifier, count in incoming.items() if count == 0)
        visited = 0
        while queue:
            identifier = queue.popleft()
            visited += 1
            for following in successors[identifier]:
                incoming[following] -= 1
                if incoming[following] == 0:
                    queue.append(following)
        if visited != len(by_id):
            issue(filename, 1, "Dependencies contain a cycle; resolve it before execution")

    validate_graph(phases, phase_by_id, "PLAN.md")
    validate_graph(tasks, task_by_id, "TASKS.md")
    verified = lambda t: t["status"] == "done" and t["result"] == "passed"
    for task in tasks:
        if task["status"] in {"blocked", "cancelled"} and not re.search(r"\bReason:\s*\S", details.get(task["id"], "")):
            issue("TASKS.md", task["line"], f"Add '- {task['id']}: Reason: ...' below the table")
        for dependency in task["after"]:
            prerequisite = task_by_id.get(dependency)
            if prerequisite and prerequisite["status"] == "cancelled":
                issue("TASKS.md", task["line"], "A cancelled task cannot satisfy a prerequisite; resolve replacement or scope")
            elif prerequisite and task["status"] == "doing" and not verified(prerequisite):
                issue("TASKS.md", task["line"], "An active task is waiting on an unverified prerequisite")
            elif prerequisite and task["status"] == "done" and prerequisite["status"] != "done":
                issue("TASKS.md", task["line"], "A completed task has an unfinished prerequisite; reconcile recorded history")
            elif prerequisite and task["status"] == "done" and not verified(prerequisite):
                issue("TASKS.md", task["line"], "Completed work relies on historical unverified evidence; review before dependent work", "warning")
        if task["status"] == "cancelled":
            issue("TASKS.md", task["line"], f"Review {task['id']}'s cancellation against the phase outcome; cancellation is not acceptance", "warning")
    for identifier in details:
        if identifier not in task_by_id:
            issue("TASKS.md", 1, "A task detail refers to a missing task; update renamed references")
    for number, target in mappings:
        if target not in task_by_id and not (target.startswith("Phase ") and target[6:] in phase_by_id):
            issue("TASKS.md", number, "Migration mapping target must resolve to a current task ID or Phase N")

    current_phase = current.get("Current phase", "none")
    active = references(current.get("Current task", "none"), TASK_ID, "TASKS.md", 1)
    if current_phase != "none" and current_phase not in phase_by_id:
        issue("TASKS.md", 1, "Current phase must reference PLAN, or be none")
    elif current_phase != "none" and current_phase not in groups:
        issue("TASKS.md", 1, "Decompose the current phase before activation")
    for identifier in active:
        task = task_by_id.get(identifier)
        if not task or task["phase"] != current_phase or task["status"] in {"done", "cancelled"}:
            issue("TASKS.md", 1, "Current task must refer to unfinished work in the current phase")
    doing = {t["id"] for t in tasks if t["status"] == "doing"}
    if doing and doing != set(active):
        issue("TASKS.md", 1, "Current task must list the doing rows, with no separate stale state")
    if len(doing) > 1:
        issue("TASKS.md", 1, "Multiple doing tasks require explicit parallel authorization and disjoint ownership; inspect the instruction", "warning")
    if doing and current.get("Authorization source", "unknown").lower() in {"none", "unknown"}:
        issue("TASKS.md", 1, "Active execution needs a traceable authorization source; do not invent one")
    if current_phase in phase_by_id:
        for prerequisite in phase_by_id[current_phase]["after"]:
            previous = [t for t in tasks if t["phase"] == prerequisite]
            if not previous or any(t["status"] not in {"done", "cancelled"} for t in previous):
                issue("TASKS.md", 1, "Current phase starts before its required preceding phase's tasks are complete")
            elif not all(verified(t) for t in previous):
                issue("TASKS.md", 1, "Preceding phase needs outcome/evidence review before dependent work; terminal status alone is insufficient", "warning")

    phase_views = []
    phase_prerequisites_ready = {}
    phase_checks_recorded = {}
    for phase_info in phases:
        phase_tasks = [t for t in tasks if t["phase"] == phase_info["id"]]
        prerequisites_ready = all(phase_checks_recorded.get(p, False) for p in phase_info["after"])
        phase_prerequisites_ready[phase_info["id"]] = prerequisites_ready
        phase_checks_recorded[phase_info["id"]] = prerequisites_ready and bool(phase_tasks) and all(verified(t) for t in phase_tasks)
        if not phase_tasks:
            state = "not decomposed"
        elif not prerequisites_ready:
            state = "waiting for phases"
        elif all(verified(t) for t in phase_tasks):
            state = "checks recorded"
        elif all(t["status"] in {"done", "cancelled"} for t in phase_tasks):
            state = "needs outcome review"
        elif any(t["status"] == "doing" for t in phase_tasks):
            state = "in progress"
        elif any(t["status"] == "todo" and all(d in task_by_id and verified(task_by_id[d]) for d in t["after"]) for t in phase_tasks):
            state = "ready"
        else:
            state = "blocked"
        phase_views.append(dict(id=phase_info["id"], outcome=phase_info["outcome"], state=state))
    ready = [t["id"] for t in tasks if phase_prerequisites_ready.get(current_phase, False)
             and t["phase"] == current_phase and t["status"] == "todo"
             and all(d in task_by_id and verified(task_by_id[d]) for d in t["after"])]
    valid = not any(d["level"] == "error" for d in diagnostics)
    return dict(valid=valid, diagnostics=diagnostics, current=current, phases=phase_views,
                tasks=tasks, ready_tasks=ready if valid else [])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("check", "status"))
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Project root; only four canonical documents are read")
    parser.add_argument("--json", action="store_true", help="Print the structural result as JSON")
    args = parser.parse_args(argv)
    result = inspect_project(args.root)
    if args.json:
        print(json.dumps(result, ensure_ascii=True, indent=2))
    else:
        print("Document structure: " + ("PASS" if result["valid"] else "FAIL"))
        for diagnostic in result["diagnostics"]:
            print(f"{diagnostic['level'].upper()} {diagnostic['file']}:{diagnostic['line']}: {diagnostic['message']}")
        if args.operation == "status":
            for phase in result["phases"]:
                print(f"Phase {phase['id']}: {phase['state']} — {phase['outcome']}")
            print("Current phase: " + result["current"].get("Current phase", "unknown"))
            print("Ready tasks in row order: " + (", ".join(result["ready_tasks"]) or "none"))
            print("Next checkpoint: " + result["current"].get("Next checkpoint", "unknown"))
        print("Evidence truth, phase-outcome coverage, and action permission require review; this command runs no project checks.")
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
