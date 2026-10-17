// Task 3G.18 (D-141): our `hermes` first on the PATH of the core's processes.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AEC_BIN_DIR, gatewayLockDir, RUNTIME_DIR, withOurHermesOnPath } from "./hermes-env.mjs";

describe("withOurHermesOnPath", () => {
  it("puts our folder first and keeps the rest in order", () => {
    const foreign = path.join("C:", "Users", "x", "AppData", "Local", "hermes", "bin");
    const env = withOurHermesOnPath({ PATH: [foreign, "C:\\Windows"].join(path.delimiter) });

    expect(env.PATH.split(path.delimiter)).toEqual([AEC_BIN_DIR, foreign, "C:\\Windows"]);
  });

  it("keeps the key's spelling (Windows stores `Path`) and does not duplicate our folder", () => {
    const env = withOurHermesOnPath({ Path: ["C:\\a", AEC_BIN_DIR].join(path.delimiter), X: "1" });

    expect(Object.keys(env).filter((key) => key.toUpperCase() === "PATH")).toEqual(["Path"]);
    expect(env.Path.split(path.delimiter)).toEqual([AEC_BIN_DIR, "C:\\a"]);
    expect(env.X).toBe("1");
  });

  it("works without any PATH at all", () => {
    expect(withOurHermesOnPath({}).PATH).toBe(AEC_BIN_DIR);
  });

  // 30.09.2026: the core prepends a standard install's folders at start unless they
  // are on PATH already — a routine then ran the foreign `hermes.exe` from venv\Scripts.
  it("puts the core's known install folders that exist BEHIND ours, once", () => {
    const lad = path.join("C:", "Users", "x", "AppData", "Local");
    const venv = path.join(lad, "hermes", "hermes-agent", "venv", "Scripts");
    const winget = path.join(lad, "Microsoft", "WinGet", "Links");
    const existing = new Set([venv, winget]);
    const env = withOurHermesOnPath(
      { LOCALAPPDATA: lad, PATH: ["C:\\Windows", winget.toUpperCase()].join(path.delimiter) },
      (dir) => existing.has(dir),
    );

    expect(env.PATH.split(path.delimiter)).toEqual([
      AEC_BIN_DIR,
      "C:\\Windows",
      winget.toUpperCase(),
      venv,
    ]);
  });

  it("adds nothing that does not exist", () => {
    const env = withOurHermesOnPath({ LOCALAPPDATA: "C:\\nowhere", PATH: "C:\\a" }, () => false);
    expect(env.PATH.split(path.delimiter)).toEqual([AEC_BIN_DIR, "C:\\a"]);
  });

  it("mirrors the core's list — a core upgrade that changes it fails here", () => {
    const stdio = fs.readFileSync(
      path.join(RUNTIME_DIR, ".hermes-src", "hermes_cli", "stdio.py"),
      "utf-8",
    );
    const body = stdio.slice(stdio.indexOf("def _augment_path_with_known_tools"));
    const dirs = [...body.slice(0, body.indexOf("existing =")).matchAll(/os\.path\.join\(local_appdata, ([^)]*)\)/g)].map(
      (match) => match[1].replaceAll('"', "").split(", ").join("/"),
    );
    expect(dirs).toEqual([
      "hermes/git/cmd",
      "hermes/git/bin",
      "hermes/git/usr/bin",
      "hermes/hermes-agent/venv/Scripts",
      "Microsoft/WinGet/Links",
    ]);
  });
});

describe("the wrappers", () => {
  it("both go through the gate with the pinned core's Python, nowhere else", () => {
    const sh = fs.readFileSync(path.join(AEC_BIN_DIR, "hermes"), "utf-8");
    const cmd = fs.readFileSync(path.join(AEC_BIN_DIR, "hermes.cmd"), "utf-8");
    const gate = fs.readFileSync(path.join(AEC_BIN_DIR, "hermes_gate.py"), "utf-8");

    expect(sh.startsWith("#!/bin/sh\n")).toBe(true);
    // Task T21.2: the staged core payload's own Python first, the development venv after.
    expect(sh).toContain('"$here"/../core/tools/python-*/python.exe');
    expect(sh.indexOf("/../core/tools/python-")).toBeLessThan(sh.indexOf('venv="$here/../.hermes-venv"'));
    expect(sh).toContain('"$here/hermes_gate.py" "$@"');
    expect(cmd).toContain('set "AEC_GATE_PY=%~dp0..\\.hermes-venv\\Scripts\\python.exe"');
    expect(cmd).toContain('for /d %%P in ("%~dp0..\\core\\tools\\python-*")');
    expect(cmd).toContain('"%AEC_GATE_PY%" -s "%~dp0hermes_gate.py" %*');
    expect(cmd).toContain("exit /b %ERRORLEVEL%");
    // …and the gate runs the launcher the payload's manifest names, else the venv's.
    expect(gate).toContain('json.load(handle)["runtime"]["commands"]["hermes"]');
    expect(gate).toContain('os.path.join(venv, "Scripts", "hermes.exe")');
    expect(path.dirname(AEC_BIN_DIR)).toBe(RUNTIME_DIR);
  });

  // D-165: 30.09.2026 агент поставил MCP-сервер через `printf 'y' | hermes mcp add …`.
  const venvPython = path.join(RUNTIME_DIR, ".hermes-venv", "Scripts", "python.exe");
  it.skipIf(!fs.existsSync(venvPython))("the gate lets through only what routines need", () => {
    const code = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(AEC_BIN_DIR)})`,
      "from hermes_gate import allowed",
      "cases = [",
      "  ['-p', 'smeta-kopiya', 'chat', '-c', 'Routine: x', '-q', 'mcp add config set'],",
      "  ['--profile=smeta', 'chat'], ['chat', '-q', 'hi'], ['--version'], ['-h'],",
      "  ['mcp', 'add', 'fs'], ['-p', 'default', 'mcp', 'add', 'fs'], ['config', 'set', 'a', 'b'],",
      "  ['plugins', 'install', 'x'], ['--yolo', 'chat'], [], ['-p'],",
      "]",
      "print(''.join('1' if allowed(c) else '0' for c in cases))",
    ].join("\n");
    const out = execFileSync(venvPython, ["-c", code], { encoding: "utf-8" }).trim();

    expect(out).toBe("11111" + "0000000");
  });

  it("carry no key and set no HERMES_HOME — both come from the calling process", () => {
    for (const name of ["hermes", "hermes.cmd"]) {
      const text = fs.readFileSync(path.join(AEC_BIN_DIR, name), "utf-8");
      expect(text).not.toMatch(/API_KEY|HERMES_HOME=/);
    }
  });
});

describe("gatewayLockDir (D-164)", () => {
  it("lives inside the profile, not in the shared ~/.local/state/hermes", () => {
    const home = path.join("D:", "aec", "profile");
    expect(path.dirname(gatewayLockDir(home))).toBe(home);
  });
});
