"""OCR on the product's own path, for a RapidOCR lift (task T56).

`eval/ocr_bench.py` compares engines through Docling's full PDF pipeline. Since task T43.1
that pipeline does not run in our environment (its layout models need torch, which the
lock leaves out), and the product never used it for scans anyway: `parse.recognize_pages`
renders a page with pdfium and hands it to RapidOCR `eslav` directly. This script measures
exactly that path on the same pages `ocr_bench.py` picks (`eval/samples/`, not in git):
word similarity to the page's own text layer, Cyrillic share and seconds per page.

Free, CPU only. Run from the repository root with the version under test installed:

    uv run python eval/ocr_ours_bench.py <report.md>
"""

from __future__ import annotations

import importlib.metadata as md
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from aec_rag.parse import recognize_pages  # noqa: E402
from ocr_bench import collect_pages, cyrillic_share, similarity_of  # noqa: E402


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    report = Path(sys.argv[1])
    version = md.version("rapidocr")
    ground_truth, blind = collect_pages()
    rows: list[tuple[str, int, str, float, float | None, float]] = []
    for page in ground_truth + blind:
        started = time.perf_counter()
        _, text = next(recognize_pages(page.path, [page.page_no]))
        seconds = time.perf_counter() - started
        text = text if isinstance(text, str) else ""
        score = similarity_of(page.reference, text) if page.reference else None
        rows.append((page.path.name, page.page_no, text, seconds, score, cyrillic_share(text)))
        label = f"{score:.3f}" if score is not None else "слепая"
        print(
            f"  {page.path.name[:34]:34} стр. {page.page_no:3} | {seconds:5.1f} с | {label}",
            flush=True,
        )

    # The first page also pays for loading the model (about 4 s): the median skips it.
    timed = [row[3] for row in rows[1:]] or [rows[0][3]]
    scores = [row[4] for row in rows if row[4] is not None]
    blind_rows = [row for row in rows if row[4] is None]
    lines = [
        f"# OCR нашим путём — rapidocr {version}",
        "",
        f"Эталонных страниц: {len(scores)}, слепых: {len(blind_rows)}.",
        "",
        "| Сходство, медиана | Сходство, худшее | Символов на слепой стр., медиана "
        "| Кириллица на слепых | Время на стр., медиана |",
        "|---|---|---|---|---|",
        f"| {statistics.median(scores):.3f} | {min(scores):.3f} "
        f"| {int(statistics.median(len(r[2]) for r in blind_rows))} "
        f"| {statistics.median(r[5] for r in blind_rows):.0%} "
        f"| {statistics.median(timed):.1f} с |",
        "",
    ]
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"отчёт: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
