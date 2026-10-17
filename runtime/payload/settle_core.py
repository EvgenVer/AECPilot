"""Make the staged payload agree with its own PM (task T21.2).

Runs on the payload's own interpreter, against the payload's own `pm`, after the
payload is assembled. Without it every `hermes` command of the installed core
prints "install out of sync (ffmpeg: not installed or outdated; …) — run
`hermes pm install`" (measured 2026-10-17, live acceptance 29.5): the agent reads
that line in each terminal answer and goes repairing, and `hermes pm install`
would rebuild the environment by upstream's lock — mem0 gone, pillow-heif and
ffmpeg back.

`pm.drift()` is PM's own verdict. A tool it reports as missing is one their lock
calls required and we leave out on purpose (`stage_core.py::TOOLS`: ffmpeg — the
owner's licensing decision, its only users are voice and text-to-speech, HX19);
the entry is dropped from the payload's `pm/lock.json`, nothing else. Anything
else left in the verdict fails the staging.

    <payload python> -I settle_core.py <payload dir>
"""

from __future__ import annotations

import json
import site
import sys
from pathlib import Path


def configure(out: Path) -> Path:
    runtime = json.loads((out / "manifest.json").read_text(encoding="utf-8-sig"))["runtime"]
    repo = out / runtime["repoDir"]
    site.addsitedir(str(out / runtime["sitePackages"]))
    sys.path.insert(0, str(repo))
    return repo


def main() -> int:
    out = Path(sys.argv[1]).resolve()
    repo = configure(out)
    from pm.install import drift

    missing = sorted(name for name, reason in drift(include_venv=False).items())
    lock_path = repo / "pm" / "lock.json"
    if missing:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        for name in missing:
            del lock["packages"][name]
        lock_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    left = drift()
    print(json.dumps({"dropped_from_lock": missing, "drift": left}))
    return 1 if left else 0


if __name__ == "__main__":
    raise SystemExit(main())
