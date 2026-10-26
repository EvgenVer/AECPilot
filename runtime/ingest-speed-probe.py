"""Замер скоростей индексации PDF в две скорости (задача 3H.11, docs/plan-details.md §3H пункт C).

Что меряется на каждом PDF:

1. Текстовый слой через pypdfium2 — время на весь файл и знаки по страницам.
2. Сколько страниц «без годного текста» при нескольких порогах. Годность —
   число значимых знаков (буквы и цифры) и их доля среди непробельных: мусорная
   кодировка шрифта даёт знаки, но не буквы, а одни штампы рамки — буквы, но мало.
3. Распознавание выборки страниц двумя движками:
   A — RapidOCR `eslav` (тот же, что строит Docling) на отрисованной pypdfium2 странице;
   B — Docling с `page_range` на эту страницу (разметка, таблицы, OCR картинок).

Только чтение: файлы открываются байтами, ничего не пишется.

Запуск:  .venv\\Scripts\\python.exe runtime\\ingest-speed-probe.py <pdf> [<pdf> ...]
"""

from __future__ import annotations

import sys
import time
from io import BytesIO
from pathlib import Path

THRESHOLDS = ((100, 0.5), (200, 0.6), (400, 0.6))
SAMPLE_PAGES = 3
RENDER_SCALE = 300 / 72


def letters_share(text: str) -> tuple[int, float]:
    visible = [ch for ch in text if not ch.isspace()]
    meaningful = sum(1 for ch in visible if ch.isalnum())
    return meaningful, (meaningful / len(visible)) if visible else 0.0


def text_layer(data: bytes) -> tuple[float, list[str]]:
    import pypdfium2 as pdfium

    started = time.perf_counter()
    pdf = pdfium.PdfDocument(data)
    pages = []
    for index in range(len(pdf)):
        page = pdf[index]
        textpage = page.get_textpage()
        pages.append(textpage.get_text_range())
        textpage.close()
        page.close()
    pdf.close()
    return time.perf_counter() - started, pages


def rapid_reader():
    from docling.datamodel.accelerator_options import AcceleratorOptions
    from docling.datamodel.pipeline_options import RapidOcrOptions
    from docling.models.stages.ocr.rapid_ocr_model import RapidOcrModel

    model = RapidOcrModel(
        enabled=True,
        artifacts_path=None,
        options=RapidOcrOptions(lang=["eslav"], backend="onnxruntime"),
        accelerator_options=AcceleratorOptions(),
    )
    return model.reader


def ocr_rapid(reader, data: bytes, page_no: int) -> tuple[float, str]:
    import numpy as np
    import pypdfium2 as pdfium

    started = time.perf_counter()
    pdf = pdfium.PdfDocument(data)
    image = pdf[page_no - 1].render(scale=RENDER_SCALE).to_pil().convert("RGB")
    pdf.close()
    result = reader(np.asarray(image))
    text = "\n".join(result.txts or ())
    return time.perf_counter() - started, text


def ocr_docling(converter, path: Path, data: bytes, page_no: int) -> tuple[float, str]:
    from docling.datamodel.base_models import DocumentStream

    started = time.perf_counter()
    stream = DocumentStream(name=path.name, stream=BytesIO(data))
    document = converter.convert(stream, page_range=(page_no, page_no)).document
    return time.perf_counter() - started, document.export_to_markdown()


def main(paths: list[str]) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mcp" / "aec_rag" / "src"))
    from aec_rag.parse import build_converter

    reader = None
    converter = None
    for raw in paths:
        path = Path(raw)
        data = path.read_bytes()
        seconds, pages = text_layer(data)
        stats = [letters_share(text) for text in pages]
        print(f"\n=== {path.name}: {len(data) / 2**20:.0f} МБ, {len(pages)} стр.")
        print(f"текстовый слой: {seconds:.1f} с, {sum(len(t) for t in pages)} знаков")
        for minimum, share in THRESHOLDS:
            bad = [i + 1 for i, (n, s) in enumerate(stats) if n < minimum or s < share]
            print(f"  порог {minimum} букв/цифр и доля ≥ {share}: без годного слоя {len(bad)} стр.")
        counts = sorted(n for n, _ in stats)
        print(
            f"  букв/цифр на страницу: медиана {counts[len(counts) // 2]}, "
            f"мин {counts[0]}, макс {counts[-1]}"
        )

        weakest = sorted(range(len(stats)), key=lambda i: stats[i][0])[:SAMPLE_PAGES]
        if reader is None:
            started = time.perf_counter()
            reader = rapid_reader()
            print(f"загрузка RapidOCR: {time.perf_counter() - started:.1f} с")
        if converter is None:
            started = time.perf_counter()
            converter = build_converter()
            print(f"загрузка Docling: {time.perf_counter() - started:.1f} с")
        for index in weakest:
            page_no = index + 1
            a_seconds, a_text = ocr_rapid(reader, data, page_no)
            b_seconds, b_text = ocr_docling(converter, path, data, page_no)
            a_n, _ = letters_share(a_text)
            b_n, _ = letters_share(b_text)
            print(
                f"  стр. {page_no} (слой {stats[index][0]} букв): "
                f"A RapidOCR {a_seconds:.1f} с / {a_n} букв · "
                f"B Docling {b_seconds:.1f} с / {b_n} букв"
            )
            print("    A: " + " ".join(a_text.split())[:160])
            print("    B: " + " ".join(b_text.split())[:160])


if __name__ == "__main__":
    main(sys.argv[1:])
