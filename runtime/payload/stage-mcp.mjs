// Stages the second Python runtime of the installer (task T22, SPEC UR40): our MCP
// servers `aec-sources`, `aec-rag`, `aec-roster` on Python 3.12 (Docling, LightRAG,
// RapidOCR — the core moved to 3.14 in phase 2, the servers stay, PLAN §Stack).
//
// Layout: a standalone CPython (python-build-standalone, the same builds uv and the
// core's PM use) with every dependency installed into ITS OWN site-packages. A
// standalone interpreter is relocatable and processes `.pth` files of its own
// site-packages, so the folder works wherever the installer puts it — unlike a venv,
// whose `pyvenv.cfg` and `Scripts/*.exe` carry absolute paths of the build machine.
// The servers are started as `python -m aec_rag` (`register-aec-*.mjs`), never
// through an entry-point exe.
//
// Versions come from our `uv.lock` (`uv export --frozen`, with hashes) — the same
// resolution the development `.venv` and the tests run on.
//
// RapidOCR downloads its models into its own package folder on first use; the
// staging runs that first use here, so the models ship and the installed product
// needs no network to read a scan.
//
// Usage: node runtime/payload/stage-mcp.mjs [--out runtime/mcp]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");

/** Must match `.venv/pyvenv.cfg` — the interpreter the tests run on. */
export const MCP_PYTHON_VERSION = "3.12.13";
export const MCP_PACKAGES = ["mcp/aec_sources", "mcp/aec_rag", "mcp/aec_roster"];

function run(command, args, options = {}) {
  console.log(`+ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", cwd: REPO_ROOT, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

function argValue(name, fallback) {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

export function stageMcp(out) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const downloads = path.join(out, ".python-install");
  // UV_PYTHON_INSTALL_DIR keeps the download inside the staging folder instead of
  // the developer's `%APPDATA%\uv\python`.
  run("uv", ["python", "install", MCP_PYTHON_VERSION, "--install-dir", downloads, "--no-bin"], {
    env: { ...process.env, UV_PYTHON_INSTALL_DIR: downloads },
  });
  const installed = fs.readdirSync(downloads).find((name) => name.startsWith(`cpython-${MCP_PYTHON_VERSION}`));
  if (!installed) throw new Error(`uv did not install cpython ${MCP_PYTHON_VERSION} into ${downloads}`);
  const pythonDir = path.join(out, "python");
  fs.renameSync(path.join(downloads, installed), pythonDir);
  fs.rmSync(downloads, { recursive: true, force: true });
  const python = path.join(pythonDir, process.platform === "win32" ? "python.exe" : "bin/python3");
  // uv marks its managed interpreters EXTERNALLY-MANAGED; this one is ours alone.
  for (const marker of [
    path.join(pythonDir, "Lib", "EXTERNALLY-MANAGED"),
    path.join(pythonDir, "lib", `python${MCP_PYTHON_VERSION.split(".").slice(0, 2).join(".")}`, "EXTERNALLY-MANAGED"),
  ]) {
    fs.rmSync(marker, { force: true });
  }

  const requirements = path.join(out, "requirements.txt");
  run("uv", [
    "export",
    "--frozen",
    "--all-packages",
    "--no-dev",
    "--no-emit-workspace",
    "--format",
    "requirements-txt",
    "--output-file",
    requirements,
  ]);
  run("uv", ["pip", "install", "--python", python, "--require-hashes", "-r", requirements]);
  run("uv", ["pip", "install", "--python", python, "--no-deps", ...MCP_PACKAGES]);

  // First use of RapidOCR with the model the parser names (parse.py: `eslav`,
  // onnxruntime) — downloads the models into the package folder now.
  run(python, [
    "-I",
    "-c",
    [
      "from docling.datamodel.pipeline_options import RapidOcrOptions",
      "from docling.models.stages.ocr.rapid_ocr_model import RapidOcrModel",
      "from docling.datamodel.accelerator_options import AcceleratorOptions",
      "RapidOcrModel(enabled=True, artifacts_path=None,",
      "  options=RapidOcrOptions(lang=['eslav'], backend='onnxruntime'),",
      "  accelerator_options=AcceleratorOptions())",
      "print('rapidocr models ready')",
    ].join("\n"),
  ]);
  // Smoke: every server module imports from the staged interpreter, isolated from
  // the user's site (-I) — what the core will run.
  for (const mod of ["aec_sources", "aec_rag", "aec_roster"]) {
    run(python, ["-I", "-c", `import ${mod}.server; print('${mod} ok')`]);
  }
  bakeBytecode(python, pythonDir);
  return { python, pythonDir };
}

/** Compiles the whole interpreter tree with `unchecked-hash` pycs, the way their PM bakes
 *  the core (`scripts/bundles/bytecode.py`, task T23). The installer stamps every file
 *  with the build time, so the timestamp pycs Python writes by default go stale on
 *  install and are rewritten on the first run — in a sealed tree, and against the
 *  hashes `payload-hashes.json` records. A hash pyc is trusted as is and never
 *  rewritten. Deliberately invalid test fixtures inside packages do not compile and
 *  are only counted. */
function bakeBytecode(python, pythonDir) {
  const lib = path.join(pythonDir, process.platform === "win32" ? "Lib" : "lib");
  run(python, [
    "-I",
    "-c",
    [
      "import compileall, py_compile, sys",
      "ok = compileall.compile_dir(sys.argv[1], quiet=2, force=True, workers=0,",
      "  invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)",
      "print('bytecode baked' + ('' if ok else ' (some fixtures do not compile)'))",
    ].join("\n"),
    lib,
  ]);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const out = path.resolve(argValue("--out", path.join(RUNTIME_DIR, "mcp")));
  const { python } = stageMcp(out);
  console.log(`\nDone. MCP_PYTHON=${python}`);
}
