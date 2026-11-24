"""T58: dictation benchmark - faster-whisper sizes on the owner's recordings.

Every transcription goes through the CORE's own code (`tools.voice_mode.transcribe_recording`,
the function behind `POST /api/audio/transcribe`), with a temporary HERMES_HOME whose
config.yaml holds the `stt` section - so model loading, VAD, beam size and the hallucination
gate are exactly the product's. Free and offline: the model must already be on disk.

One process per model keeps the peak memory honest. Run by the core's interpreter with the
`stt-whisper` packages on PYTHONPATH:

    PYTHONPATH=<venv with faster-whisper>/Lib/site-packages \
    runtime/.hermes-venv/Scripts/python.exe eval/dictation_bench.py \
        --model <folder of the CTranslate2 model> --label small --out <dir>

`--prompt` sets `stt.local.initial_prompt` (the vocabulary hint) from a file.
`--summary <dir>` prints the table over the JSON files of earlier runs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "eval" / "samples" / "dictation"
CORE_SRC = ROOT / "runtime" / ".hermes-src"

# What an engineer would have to correct by hand: the terms, numbers and designations of
# eval/dictation-phrases.md. Each item is a list of accepted spellings - regular expressions
# over the normalised text (lower case, `ё` -> `е`, quotes and dashes unified), because the
# person may say «диаметр двенадцать» and the model may write «12».
ITEMS: dict[int, dict[str, list[str]]] = {
    1: {
        "армирование плиты перекрытия": [r"армирован\w+ плит\w+ перекрыти"],
        "отметка +12,600": [
            r"\+? ?12[,.]600",
            r"двенадцать шестьсот",
            r"\+? ?12 600",
            r"12[,.]6\b",
        ],
        "нижняя сетка": [r"нижн\w+ сетк"],
        "А500С": [r"[аa] ?-?500 ?-?[сc]\b", r"[аa] ?пятьсот ?[сc]\b"],
        "диаметр 12": [r"диаметр\w* (12|двенадцать)", r"[øф] ?12"],
        "шаг 200": [r"шаг\w* (200|двести)"],
    },
    2: {
        "прогиб балки": [r"прогиб балк"],
        "Б-3": [r"балк\w+ [бb] ?-? ?(3|три)\b"],
        "СП 63.13330": [r"\bсп ?63[., ]+13 ?330"],
        "пролёт 6 м": [r"пролет\w* (6|шесть) ?м"],
    },
    3: {
        "защитный слой бетона": [r"защитн\w+ сло\w+ бетона"],
        "фундаментная плита": [r"фундаментн\w+ плит"],
        "50 мм": [r"(50|пятьдесят) ?(мм|миллиметр)"],
    },
    4: {
        "класс бетона колонн": [r"класс бетона колонн"],
        "оси А–В / 1–4": [
            r"ос\w+ [аa] ?-? ?[вb][ /,-]+(1|один) ?-? ?(4|четыре)",
            r"ос\w+ [аa] ?-? ?[вb],? ?(и )?(дробь )?(1|один)[ -]+(4|четыре)",
        ],
        "B30": [r"\b[вbб] ?-?30\b", r"\b[вbб] тридцать"],
        "марка по морозостойкости": [r"марк\w+ по морозостойкости"],
        "F150": [r"\b(f|ф|эф) ?-?150\b", r"\b(f|ф|эф) сто пятьдесят"],
        "водонепроницаемость": [r"водонепроницаемости"],
        "W6": [r"\b(w|в|дабл-?ю|дубль-?в) ?-?6\b", r"\b(w|в|дабл-?ю|дубль-?в) шесть"],
    },
    5: {
        "раздел КЖ": [r"раздел\w* кж\b"],
        "узел сопряжения": [r"уз\w+ сопряжени"],
        "монолитная стена": [r"монолитн\w+ стен"],
        "плита перекрытия": [r"плит\w+ перекрыти"],
    },
    6: {
        "нагрузка на перекрытие": [r"нагрузк\w+ на перекрыти"],
        "постоянная 4,5": [
            r"постоянная[ ,:-]+4[,.]5",
            r"постоянная[ ,:-]+четыре и пять десятых",
            r"постоянная[ ,:-]+4 и 5 десятых",
        ],
        "килопаскаля (кПа)": [r"килопаскал", r"\bкпа\b"],
        "временная 2": [r"временная[ ,:-]+(2|два)\b"],
        "коэффициент надёжности": [r"коэффициент\w* надежности"],
        "1,2": [
            r"надежности[ ,:-]+1[,.]2",
            r"надежности[ ,:-]+один и два",
            r"надежности[ ,:-]+1 и 2",
        ],
    },
    7: {
        "спецификация металлоконструкций": [r"спецификаци\w+ металлоконструкци"],
        "КМ": [r"\bкм\b"],
        "ведомость расхода стали": [r"ведомость\w* расхода стали"],
        "двутавр": [r"двутавр"],
        "30Б1": [r"30 ?-?[бb] ?-?1\b"],
    },
    8: {
        "шаг поперечной арматуры": [r"шаг поперечной арматуры"],
        "колонна 150": [r"колонн\w+[ ,:-]+(150|сто пятьдесят)"],
        "хомуты": [r"хомуты"],
        "А240": [r"[аa] ?-?240\b", r"[аa] двести сорок"],
        "диаметр 8": [r"диаметр\w* (8|восемь)", r"[øф] ?8"],
    },
    9: {
        "замечания": [r"замечани"],
        "продавливание плиты": [r"продавливани\w+ плит"],
        "колонна К-7": [r"колонн\w+ (к|k) ?-? ?(7|семь)\b"],
        "не проверено": [r"не проверен"],
    },
    10: {
        "расчётная модель": [r"расчетн\w+ модел"],
        "ЛИРА": [r"\bлир[аеуы]\b"],
        "пересчитай": [r"пересчита"],
        "РСУ": [r"\bрсу\b"],
        "жёсткость диафрагм": [r"жесткост\w+ диафрагм"],
    },
}


def phrases() -> dict[int, str]:
    text = (ROOT / "eval" / "dictation-phrases.md").read_text(encoding="utf-8")
    found = re.findall(r"^(\d+)\. (.+?)(?=^\d+\. |\Z)", text, re.M | re.S)
    return {int(number): " ".join(body.split()) for number, body in found}


def normalise(text: str) -> str:
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[–—−‑]", "-", text)
    text = re.sub(r"[«»\"“”„;:!?()]", " ", text)
    return " ".join(text.split())


NUMBER_WORDS = {
    "один": "1",
    "два": "2",
    "три": "3",
    "четыре": "4",
    "пять": "5",
    "шесть": "6",
    "семь": "7",
    "восемь": "8",
    "двенадцать": "12",
    "пятьдесят": "50",
    "двести": "200",
    "шестьсот": "600",
}


def words(text: str) -> list[str]:
    """Words for the word error rate: digits for number words, no punctuation."""
    text = normalise(text).replace("сто пятьдесят", "150").replace("плюс", "+")
    text = text.replace("четыре и пять десятых", "4,5").replace("один и два", "1,2")
    text = text.replace("двенадцать шестьсот", "12,600")
    tokens = re.findall(r"[a-zа-я0-9]+", text.replace("+", " "))
    latin = str.maketrans("abcekmhopt", "авсекмнорт")
    return [NUMBER_WORDS.get(token, token).translate(latin) for token in tokens]


def distance(a: list[str], b: list[str]) -> int:
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        previous, row[0] = row[0], i
        for j, y in enumerate(b, 1):
            previous, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, previous + (x != y))
    return row[-1]


def score(number: int, transcript: str) -> dict[str, bool]:
    text = normalise(transcript)
    return {
        name: any(re.search(pattern, text) for pattern in accepted)
        for name, accepted in ITEMS[number].items()
    }


def run(args: argparse.Namespace) -> None:
    prompt = args.prompt.read_text(encoding="utf-8").strip() if args.prompt else ""
    home = Path(tempfile.mkdtemp(prefix="aec-dictation-bench-"))
    config = {
        "stt": {
            "enabled": True,
            "provider": "local",
            "language": "ru",
            "local": {
                "model": args.model,
                "device": "cpu",
                "compute_type": args.compute_type,
                "initial_prompt": prompt,
            },
        }
    }
    # JSON is YAML.
    (home / "config.yaml").write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    os.environ["HERMES_HOME"] = str(home)
    os.environ["HF_HUB_OFFLINE"] = "1"
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(CORE_SRC))

    import psutil
    from tools import transcription_tools
    from tools.stt_lease import warm_stt_provider
    from tools.transcription_local import build_local_transcribe_kwargs
    from tools.voice_mode import transcribe_recording

    provider = transcription_tools._get_provider(transcription_tools._load_stt_config())
    started = time.perf_counter()
    warm = warm_stt_provider()
    load_seconds = time.perf_counter() - started
    if not warm.get("warmed"):
        raise SystemExit(f"model did not load: {warm}")

    from faster_whisper.audio import decode_audio

    # The first clip after the load pays for the threads and the decoder's caches.
    started = time.perf_counter()
    transcribe_recording(str(SAMPLES / "1.m4a"))
    cold_seconds = time.perf_counter() - started

    reference = phrases()
    rows = []
    for number in sorted(ITEMS):
        audio = SAMPLES / f"{number}.m4a"
        seconds = len(decode_audio(str(audio))) / 16000
        started = time.perf_counter()
        result = transcribe_recording(str(audio))
        elapsed = time.perf_counter() - started
        if not result.get("success"):
            raise SystemExit(f"{audio.name}: {result}")
        transcript = result["transcript"]
        ref, hyp = words(reference[number]), words(transcript)
        rows.append(
            {
                "number": number,
                "audio_seconds": round(seconds, 2),
                "seconds": round(elapsed, 2),
                "transcript": transcript,
                "errors": distance(ref, hyp),
                "words": len(ref),
                "items": score(number, transcript),
            }
        )
        print(f"{number:2d} {elapsed:6.2f}s  {transcript}", flush=True)

    memory = psutil.Process().memory_info()
    report = {
        "label": args.label,
        "provider": provider,
        "compute_type": args.compute_type,
        "prompt": prompt,
        "transcribe_kwargs": {
            key: value
            for key, value in build_local_transcribe_kwargs().items()
            if key != "initial_prompt"
        },
        "load_seconds": round(load_seconds, 2),
        "cold_seconds": round(cold_seconds, 2),
        "peak_mb": round(getattr(memory, "peak_wset", memory.rss) / 2**20),
        "rows": rows,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / f"{args.label}.json"
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"-> {target}")


def summary(folder: Path) -> None:
    for path in sorted(folder.glob("*.json")):
        report = json.loads(path.read_text(encoding="utf-8"))
        rows = report["rows"]
        items = [ok for row in rows for ok in row["items"].values()]
        audio = sum(row["audio_seconds"] for row in rows)
        spent = sum(row["seconds"] for row in rows)
        errors = sum(row["errors"] for row in rows)
        total = sum(row["words"] for row in rows)
        print(
            f"{report['label']:18s} items {sum(items)}/{len(items)} ({sum(items) / len(items):.0%})"
            f"  WER {errors / total:.0%}  time {spent:.1f}s for {audio:.1f}s of speech"
            f" (x{spent / audio:.2f}), per phrase {spent / len(rows):.1f}s"
            f" max {max(row['seconds'] for row in rows):.1f}s"
            f"  load {report['load_seconds']}s  first phrase {report['cold_seconds']}s"
            f"  memory {report['peak_mb']} MB"
        )
        for row in rows:
            missed = [name for name, ok in row["items"].items() if not ok]
            if missed:
                print(f"    {row['number']:2d} missed {missed}\n       {row['transcript']}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", help="folder of the CTranslate2 model")
    parser.add_argument("--label")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--prompt", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args()
    if args.summary:
        summary(args.summary)
    else:
        run(args)


if __name__ == "__main__":
    main()
