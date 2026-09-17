"""Образец документов для автоприёмки (задача 3F.1) — та часть, которую удобнее
собрать из Python: DOCX (python-docx) и TXT в двух кодировках. XLSX/CSV/MD/PDF и
битые файлы собирает `e2e/lib/vault.ts` (exceljs, Electron).

Вызов: python make_vault.py <папка source-a>
"""

from __future__ import annotations

import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt

# Раздел, на который ведёт ссылка «ПЗ.docx, Кабельный журнал» (блок 19).
SECTION = "Кабельный журнал"
# Строка, которую ищут в TXT и по которой проверяют кодировку (блок 17).
TXT_LINE = "Кабель ВВГнг-LS 3х2,5 — прокладка в лотке"


def make_docx(path: Path) -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    doc.add_heading("Пояснительная записка", level=0)
    doc.add_heading("Введение", level=1)
    for i in range(1, 9):
        doc.add_paragraph(
            f"Абзац введения {i}. Настоящая записка составлена к проекту электроснабжения "
            "объекта; расчётные нагрузки приняты по СП 256.1325800.2016, категория "
            "надёжности — вторая."
        )
    doc.add_page_break()

    doc.add_heading(SECTION, level=1)
    doc.add_paragraph("Перечень кабельных линий по проекту приведён в таблице.")
    table = doc.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    for cell, text in zip(
        table.rows[0].cells, ("Маркировка", "Откуда", "Куда", "Кабель"), strict=True
    ):
        cell.text = text
    rows = [
        ("Л-1", "ГРЩ", "ЩС-1", "ВВГнг-LS 5х16"),
        ("Л-2", "ГРЩ", "ЩС-2", "ВВГнг-LS 5х10"),
        ("Л-3", "ЩС-1", "ЩО-1", "ВВГнг-LS 3х2,5"),
    ]
    for row in rows:
        cells = table.add_row().cells
        for cell, text in zip(cells, row, strict=True):
            cell.text = text
    doc.add_paragraph("Итого по журналу: три линии, общая длина 412 м.")
    doc.add_page_break()

    doc.add_heading("Заключение", level=1)
    doc.add_paragraph("Проект соответствует заданию на проектирование.")
    doc.save(path)


def make_txt(folder: Path) -> None:
    body = f"Заметка по кабелю.\n{TXT_LINE}\nДлина трассы 120 м.\n"
    (folder / "заметка-1251.txt").write_bytes(body.encode("cp1251"))
    (folder / "заметка-utf8.txt").write_bytes(body.encode("utf-8"))
    (folder / "подпапка").mkdir(exist_ok=True)
    (folder / "подпапка" / "письмо.txt").write_text(
        "Письмо заказчику: замечаний нет.\n", encoding="utf-8"
    )


def make_csv_1251(folder: Path) -> None:
    """CSV с `;` в cp1251 — ровно то, что отдаёт русский Excel. Значение «2,5»
    с запятой внутри проверяет разбор разделителя (блок 18)."""
    rows = [
        "Помещение;Нагрузка, кВт;Кабель",
        "Щитовая;12,5;ВВГнг-LS 5х16",
        "Насосная;2,5;ВВГнг-LS 3х2,5",
        "Офис;8;ВВГнг-LS 5х6",
    ]
    (folder / "нагрузки.csv").write_bytes(("\n".join(rows) + "\n").encode("cp1251"))


def main() -> None:
    folder = Path(sys.argv[1])
    folder.mkdir(parents=True, exist_ok=True)
    make_docx(folder / "ПЗ.docx")
    make_txt(folder)
    make_csv_1251(folder)
    print("VAULT_PY_OK")


if __name__ == "__main__":
    main()
