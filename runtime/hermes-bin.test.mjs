// Task 3G.18 (D-141): our `hermes` first on the PATH of the core's processes.

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AEC_BIN_DIR, RUNTIME_DIR, withOurHermesOnPath } from "./hermes-env.mjs";

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
  it("both point at the pinned core in runtime/.hermes-venv, nowhere else", () => {
    const sh = fs.readFileSync(path.join(AEC_BIN_DIR, "hermes"), "utf-8");
    const cmd = fs.readFileSync(path.join(AEC_BIN_DIR, "hermes.cmd"), "utf-8");

    expect(sh.startsWith("#!/bin/sh\n")).toBe(true);
    expect(sh).toContain('venv="$here/../.hermes-venv"');
    expect(cmd).toContain('"%~dp0..\\.hermes-venv\\Scripts\\hermes.exe" %*');
    expect(path.dirname(AEC_BIN_DIR)).toBe(RUNTIME_DIR);
  });

  it("carry no key and set no HERMES_HOME — both come from the calling process", () => {
    for (const name of ["hermes", "hermes.cmd"]) {
      const text = fs.readFileSync(path.join(AEC_BIN_DIR, name), "utf-8");
      expect(text).not.toMatch(/API_KEY|HERMES_HOME=/);
    }
  });
});
