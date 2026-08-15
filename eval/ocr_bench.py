"""Замер OCR-движков Docling на настоящих русских документах (задача 2.2, риск R4).

Запуск: `uv run python eval/ocr_bench.py` из корня репозитория.
Читает `eval/samples/` (в git не попадает), пишет `eval/ocr-report.md`.

Методика — два набора, потому что ни один сам по себе не отвечает на вопрос:

* **Эталонный набор.** Страницы, у которых ЕСТЬ текстовый слой. Страница
  рендерится в картинку, отдаётся движку, результат сравнивается с этим самым
  текстовым слоем. Даёт число: насколько распознанное совпало с тем, что в
  документе написано на самом деле.
* **Слепой набор.** Страницы настоящего скана, где текстового слоя нет вовсе.
  Сравнивать не с чем, поэтому меряются объём выдачи, доля кириллицы (движок с
  неправильной языковой моделью выдаёт узнаваемый мусор) и время.

Оба набора обязательны: на эталонном движок может выигрывать за счёт чистого
рендера и проиграть на реальном скане с наклоном и печатями.
"""

from __future__ import annotations

import re
import statistics
import sys
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from io import BytesIO
from pathlib import Path

import pypdfium2 as pdfium
from docling.datamodel.base_models import DocumentStream, InputFormat
from docling.datamodel.pipeline_options import (
    EasyOcrOptions,
    PdfPipelineOptions,
    RapidOcrOptions,
)
from docling.datamodel.settings import settings as docling_settings
from docling.document_converter import DocumentConverter, PdfFormatOption

SAMPLES = Path("eval/samples")
REPORT = Path("eval/ocr-report.md")

# Сколько страниц берём из каждого набора. Больше — точнее, но каждая страница
# это полностраничный OCR на CPU: считайте секунды на страницу на движок.
GROUND_TRUTH_PAGES = 6
BLIND_PAGES = 4

# Порог, ниже которого страница считается лишённой текстового слоя.
TEXT_LAYER_THRESHOLD = 40

ENGINES: dict[str, object] = {
    # PP-OCRv4, кириллическая модель распознавания. Единственный вариант,
    # доступный без единой доустановки: rapidocr приезжает с docling[standard].
    "rapidocr · torch · cyrillic": RapidOcrOptions(
        lang=["cyrillic"], backend="torch", force_full_page_ocr=True
    ),
    # PP-OCRv5, модель eslav — восточнославянская, то есть обученная ровно на
    # русском/украинском/белорусском, а не на «кириллице вообще».
    "rapidocr · onnxruntime · eslav": RapidOcrOptions(
        lang=["eslav"], backend="onnxruntime", force_full_page_ocr=True
    ),
    "easyocr · ru+en": EasyOcrOptions(lang=["ru", "en"], force_full_page_ocr=True),
}

# Вывод, сделанный по результатам прогона 2026-08-14. Живёт рядом с методикой
# намеренно: решение без метода, которым оно получено, через полгода никто не
# сможет перепроверить. Если новый прогон меняет картину — правится здесь.
DECISION = """\
**Дефолт — `rapidocr` на бэкенде `onnxruntime` с моделью `eslav`** (PP-OCRv5,
восточнославянская). Решение от 2026-08-14 по прогону ниже.

Почему не `easyocr`, хотя по сходству он впереди (0.77 против 0.71): он **в 12 раз
медленнее на сканах** — 66 с против 5,5 с на страницу. Скан из наших образцов на 55
страниц это час против пяти минут, а в настоящем проекте таких страниц сотни. Разница в
качестве при этом косметическая: на выдержках обе модели дают читаемый русский
технический текст, easyocr местами теряет пробел («2этажное»), eslav местами теряет
короткое слово в начале строки.

Почему не `rapidocr · torch · cyrillic`, который доступен вообще без доустановок: он
негоден. 0.23 сходства и характерная латинско-кириллическая каша в выдаче
(«B3aM. WHB. Hод.») — это модель PP-OCRv3 «кириллица вообще», и русский технический
текст она не держит. Именно ради этого сравнения в замер и добавлен `onnxruntime`:
разница между «кириллица» и «восточнославянская» оказалась решающей.

Цена решения — одна зависимость: `onnxruntime` (~15 МБ). Через экстру docling его брать
нельзя, на Windows она резолвится в `onnxruntime-gpu` и требует CUDA.

**Чего этот замер НЕ говорит.** Настоящий скан в образцах один (научно-технический
отчёт); остальные «сканы» оказались документами с текстовым слоем. Поэтому строки
«слепого набора» меряют в основном скорость, а не точность на плохой бумаге. Строка
«худшее сходство» (0.02–0.08) — это страница архитектурного чертежа, где текстового слоя
всего несколько подписей поверх графики: там метрика не значит ничего. Tesseract не
мерялся: он требует установки системной программы, а это выходит за рамки воркспейса —
если понадобится, решать отдельно.
"""

_WORD = re.compile(r"[^\w\s]", flags=re.UNICODE)
_SPACE = re.compile(r"\s+")
_CYRILLIC = re.compile(r"[а-яёА-ЯЁ]")


@dataclass(frozen=True)
class Page:
    path: Path
    page_no: int
    reference: str  # пусто для слепого набора


@dataclass
class Result:
    engine: str
    page: Page
    text: str
    seconds: float
    similarity: float | None


def words(text: str) -> list[str]:
    """Нормализованные слова — единица сравнения.

    Сравнение по СЛОВАМ, а не по символам, и с `autojunk=False`: у
    `SequenceMatcher` эвристика «популярный элемент — мусор» срабатывает на
    любой последовательности длиннее 200, а в посимвольном сравнении русского
    текста популярны примерно все буквы, и сходство схлопывается в ноль
    независимо от качества распознавания.
    """
    return _SPACE.sub(" ", _WORD.sub(" ", text.lower())).strip().split()


def similarity_of(reference: str, produced: str) -> float:
    return SequenceMatcher(None, words(reference), words(produced), autojunk=False).ratio()


def cyrillic_share(text: str) -> float:
    letters = [character for character in text if character.isalpha()]
    if not letters:
        return 0.0
    return len(_CYRILLIC.findall("".join(letters))) / len(letters)


def page_texts(path: Path) -> list[str]:
    document = pdfium.PdfDocument(path)
    try:
        return [document[index].get_textpage().get_text_bounded() for index in range(len(document))]
    finally:
        document.close()


def collect_pages() -> tuple[list[Page], list[Page]]:
    """Разложить страницы образцов на эталонный и слепой наборы.

    Страницы берутся по кругу, по одной из каждого документа: набор из шести
    страниц одного файла измерил бы один шрифт и одного издателя, а не движок.
    """
    with_text: dict[Path, list[Page]] = {}
    without_text: dict[Path, list[Page]] = {}

    for path in sorted(SAMPLES.rglob("*.pdf")):
        for index, text in enumerate(page_texts(path)):
            page_no = index + 1
            stripped = text.strip()
            if len(stripped) >= TEXT_LAYER_THRESHOLD:
                with_text.setdefault(path, []).append(Page(path, page_no, stripped))
            else:
                without_text.setdefault(path, []).append(Page(path, page_no, ""))

    return _round_robin(with_text, GROUND_TRUTH_PAGES), _round_robin(without_text, BLIND_PAGES)


def _round_robin(pages: dict[Path, list[Page]], limit: int) -> list[Page]:
    # Первые страницы документа — титул и содержание; они короткие и меряют не
    # то. Берём из середины.
    queues = [document[len(document) // 3 :] for document in pages.values() if document]
    chosen: list[Page] = []
    position = 0
    while len(chosen) < limit and any(position < len(queue) for queue in queues):
        for queue in queues:
            if position < len(queue) and len(chosen) < limit:
                chosen.append(queue[position])
        position += 1
    return chosen


def build_converter(ocr_options) -> DocumentConverter:
    docling_settings.inference.compile_torch_models = False
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.ocr_options = ocr_options
    pipeline_options.do_table_structure = False
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )


def run_engine(name: str, ocr_options, pages: list[Page]) -> list[Result]:
    converter = build_converter(ocr_options)
    results: list[Result] = []
    for page in pages:
        started = time.time()
        try:
            # Потоком, а не путём: docling-parse не открывает пути с кириллицей.
            # Причина и замер — в `aec_rag.parse._convert`.
            source = DocumentStream(name=page.path.name, stream=BytesIO(page.path.read_bytes()))
            page_range = (page.page_no, page.page_no)
            text = converter.convert(source, page_range=page_range).document.export_to_markdown()
        except Exception as exc:  # noqa: BLE001 — падение движка это результат замера
            text = f"__ОШИБКА__ {type(exc).__name__}: {exc}"
        seconds = time.time() - started
        similarity = similarity_of(page.reference, text) if page.reference else None
        results.append(Result(name, page, text, seconds, similarity))
        print(
            f"  {name} | {page.path.name[:34]:34} стр.{page.page_no:4} | "
            f"{seconds:6.1f} с | "
            f"{'сходство ' + format(similarity, '.3f') if similarity is not None else 'слепая'}",
            flush=True,
        )
    return results


def excerpt(text: str, limit: int = 220) -> str:
    flat = _SPACE.sub(" ", text).strip()
    return flat[:limit] + ("…" if len(flat) > limit else "")


def write_report(
    ground_truth: list[Page], blind: list[Page], results: dict[str, list[Result]]
) -> None:
    lines: list[str] = []
    lines.append("# Замер OCR-движков Docling на русских документах (задача 2.2)\n")
    lines.append(
        "Сгенерирован `eval/ocr_bench.py`. Образцы лежат в `eval/samples/` и в git "
        "не попадают, поэтому отчёт воспроизводится только на машине, где они есть.\n"
    )

    lines.append("## Решение\n")
    lines.append(DECISION)

    lines.append("## Что мерили\n")
    lines.append(
        f"**Эталонный набор — {len(ground_truth)} страниц** с текстовым слоем: страница "
        "рендерится в картинку, распознаётся движком, результат сравнивается с текстовым "
        "слоем той же страницы (`difflib`, после приведения к нижнему регистру и снятия "
        "пунктуации).\n"
    )
    for page in ground_truth:
        lines.append(f"- `{page.path.name}`, стр. {page.page_no}")
    lines.append("")
    lines.append(
        f"**Слепой набор — {len(blind)} страниц** настоящего скана без текстового слоя: "
        "сравнивать не с чем, поэтому смотрим объём выдачи, долю кириллицы и время.\n"
    )
    for page in blind:
        lines.append(f"- `{page.path.name}`, стр. {page.page_no}")
    lines.append("")

    lines.append("## Эталонный набор — сходство с текстовым слоем\n")
    lines.append("| Движок | Сходство, медиана | Сходство, худшее | Время на стр., медиана |")
    lines.append("|---|---|---|---|")
    for name, engine_results in results.items():
        scored = [r for r in engine_results if r.similarity is not None]
        if not scored:
            lines.append(f"| {name} | — | — | — |")
            continue
        similarities = [r.similarity for r in scored]
        lines.append(
            f"| {name} | {statistics.median(similarities):.3f} | {min(similarities):.3f} | "
            f"{statistics.median([r.seconds for r in scored]):.1f} с |"
        )
    lines.append("")

    lines.append("## Слепой набор — настоящий скан\n")
    lines.append("| Движок | Символов на стр., медиана | Доля кириллицы | Время на стр., медиана |")
    lines.append("|---|---|---|---|")
    for name, engine_results in results.items():
        blind_results = [r for r in engine_results if r.similarity is None]
        if not blind_results:
            lines.append(f"| {name} | — | — | — |")
            continue
        lengths = [len(r.text.strip()) for r in blind_results]
        shares = [cyrillic_share(r.text) for r in blind_results]
        lines.append(
            f"| {name} | {int(statistics.median(lengths))} | "
            f"{statistics.median(shares):.0%} | "
            f"{statistics.median([r.seconds for r in blind_results]):.1f} с |"
        )
    lines.append("")

    lines.append("## Выдержки — глазами\n")
    lines.append(
        "Числа не показывают, ЧТО именно распознано. Ниже — первая страница каждого "
        "набора у каждого движка.\n"
    )
    for name, engine_results in results.items():
        lines.append(f"### {name}\n")
        for label, predicate in (
            ("эталонная страница", lambda r: r.similarity is not None),
            ("страница скана", lambda r: r.similarity is None),
        ):
            first = next((r for r in engine_results if predicate(r)), None)
            if first is None:
                continue
            lines.append(f"*{label}* (`{first.page.path.name}`, стр. {first.page.page_no}):\n")
            lines.append(f"> {excerpt(first.text)}\n")
            if first.page.reference:
                reference = excerpt(first.page.reference)
                lines.append(f"Текстовый слой той же страницы:\n\n> {reference}\n")
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not SAMPLES.is_dir():
        print(f"нет каталога {SAMPLES} — положите образцы (см. eval/README.md)", file=sys.stderr)
        return 1

    ground_truth, blind = collect_pages()
    print(f"эталонных страниц: {len(ground_truth)}, слепых: {len(blind)}", flush=True)
    if not ground_truth or not blind:
        print("недостаточно образцов для замера", file=sys.stderr)
        return 1

    results: dict[str, list[Result]] = {}
    for name, ocr_options in ENGINES.items():
        print(f"=== {name}", flush=True)
        try:
            results[name] = run_engine(name, ocr_options, ground_truth + blind)
        except Exception as exc:  # noqa: BLE001 — движок может не подняться вовсе
            print(f"  движок не поднялся: {type(exc).__name__}: {exc}", flush=True)
            results[name] = []

    write_report(ground_truth, blind, results)
    print(f"отчёт: {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
