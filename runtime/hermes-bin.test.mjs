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
