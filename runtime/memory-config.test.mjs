// Задачи 5.1а и 5.2 — ГЕЙТ четырёх ключей второго слоя памяти и проектный скоуп.
//
// Этот файл существует ради одного: правка, потерявшая любой из четырёх, должна
// краснеть ЗДЕСЬ, а не всплывать месяцем позже тем, что память не пополнялась
// или что переписка уезжала на чужой адрес. Поэтому проверки написаны от
// обещаний спеки, а не от формы функций, и две из них читают ЧУЖИЕ файлы —
// исходник ядра и наш `serve.mjs`, — потому что ключ, стоящий в модуле, но
// никуда не подключённый, не настраивает ничего.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyMemoryProfile,
  buildMem0Json,
  CORE_BASE_URL_ENV,
  CORE_OPENAI_BASE_URL,
  coreEndpoint,
  MEM0_DIR_NAME,
  MEMORY_ENV,
  memoryEnv,
  MEMORY_PROVIDER,
  memoryCollection,
  mergeMemoryProviderIntoConfigYaml,
  projectMemoryKey,
  SYNC_MAX_CHARS,
  vectorStorePath,
} from "./memory-config.mjs";
import { RUNTIME_DIR } from "./hermes-env.mjs";

const HERMES_SRC = path.join(RUNTIME_DIR, ".hermes-src");
const HOME = process.platform === "win32" ? "D:\\профиль" : "/профиль";

const mem0 = (env = {}) =>
  buildMem0Json({}, { baseUrl: coreEndpoint(env), vectorPath: vectorStorePath(HOME) });

describe("ключ 1: memory.provider", () => {
  it("включает второй слой именем, которое ядро ищет в конфиге", () => {
    expect(MEMORY_PROVIDER).toBe("mem0");
  });

  it("вносится в config.yaml, где секции memory ещё нет", () => {
    const { text, changed } = mergeMemoryProviderIntoConfigYaml("model:\n  default: gpt-5-mini\n");

    expect(changed).toBe(true);
    expect(text).toContain("memory:\n  provider: mem0\n");
    expect(text, "чужие ключи обязаны уцелеть").toContain("default: gpt-5-mini");
  });

  it("заменяет ЧУЖОГО провайдера, а не дописывает второго", () => {
    const { text } = mergeMemoryProviderIntoConfigYaml("memory:\n  provider: honcho\n  ttl: 30\n");

    expect(text).toContain("  provider: mem0");
    expect(text).not.toContain("honcho");
    expect(text, "остальные ключи секции — не наши").toContain("  ttl: 30");
  });

  it("повторный вызов ничего не меняет: слияние идемпотентно", () => {
    const once = mergeMemoryProviderIntoConfigYaml("memory:\n  provider: mem0\n");
    const twice = mergeMemoryProviderIntoConfigYaml(once.text);

    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
  });
});

describe("ключ 2: mode oss", () => {
  it("режим стоит явно — умолчание плагина облачное", () => {
    expect(mem0().mode).toBe("oss");
  });

  it("хранилище встроенное: путь, а не адрес сервера", () => {
    const store = mem0().oss.vector_store;

    expect(store.provider).toBe("qdrant");
    expect(store.config.path).toBe(vectorStorePath(HOME));
    expect(store.config.url, "адрес означал бы отдельный сервер").toBeUndefined();
  });

  it("хранилище лежит В ПРОФИЛЕ: у их умолчания один путь на все профили", () => {
    expect(vectorStorePath(HOME).startsWith(HOME)).toBe(true);
  });
});

describe("ключ 3: openai_base_url обоих блоков", () => {
  it("оба блока направлены на endpoint ядра", () => {
    const config = mem0();

    expect(config.oss.llm.config.openai_base_url).toBe(CORE_OPENAI_BASE_URL);
    expect(config.oss.embedder.config.openai_base_url).toBe(CORE_OPENAI_BASE_URL);
  });

  it("человек перенаправил ЯДРО — память едет туда же, не зная про mem0", () => {
    // Главное обещание спеки: не «локальный адрес», а ТОТ ЖЕ адрес.
    const config = mem0({ [CORE_BASE_URL_ENV]: "http://127.0.0.1:8080/v1" });

    expect(config.oss.llm.config.openai_base_url).toBe("http://127.0.0.1:8080/v1");
    expect(config.oss.embedder.config.openai_base_url).toBe("http://127.0.0.1:8080/v1");
  });

  it("пустая переменная — не адрес: берётся умолчание, а не пустая строка", () => {
    expect(coreEndpoint({ [CORE_BASE_URL_ENV]: "   " })).toBe(CORE_OPENAI_BASE_URL);
  });

  it("умолчание совпадает с тем, что ядро читает у себя", () => {
    // Значение продублировано у нас, и разъехаться оно может молча. Источник
    // истины — их реестр провайдеров; читается исходником, а не импортом.
    // До 0.21.0 запись была `"openai-api": ProviderConfig(inference_base_url=…,
    // base_url_env_var=…)`, с 0.21.2 — кортеж-строка `_REGISTRY_ROWS`:
    // `("openai-api", name, inference_base_url, api_key_env_vars, base_url_env_var)`.
    // Окно в 600 символов от `"openai-api"` покрывает запись в любой из форм.
    const auth = fs.readFileSync(path.join(HERMES_SRC, "hermes_cli", "auth.py"), "utf-8");
    const start = auth.indexOf('"openai-api"');
    expect(start).toBeGreaterThan(-1);
    const entry = auth.slice(start, start + 600);

    expect(entry).toContain(`"${CORE_OPENAI_BASE_URL}"`);
    expect(entry).toContain(`"${CORE_BASE_URL_ENV}"`);
  });
});

describe("ключ 4: MEM0_TELEMETRY", () => {
  it("выключена значением, которое их модуль считает ложью", () => {
    // `mem0/memory/telemetry.py`: истиной считаются "true"/"1"/"yes".
    expect(MEMORY_ENV.MEM0_TELEMETRY).toBe("false");
    expect(["true", "1", "yes"]).not.toContain(MEMORY_ENV.MEM0_TELEMETRY.toLowerCase());
  });

  it("подключена к ЗАПУСКУ ядра, а не просто объявлена", () => {
    // Ключ, стоящий в модуле и никуда не переданный, не выключает ничего.
    // Читается исходник: окружение процесса иначе не проверить без запуска.
    const serve = fs.readFileSync(path.join(RUNTIME_DIR, "serve.mjs"), "utf-8");

    expect(serve).toContain('import { memoryEnv } from "./memory-config.mjs"');
    expect(serve).toContain("...memoryEnv(HERMES_HOME_DIR),");
  });

  it("переменная стоит ДО extraEnv: вызывающий вправе её перекрыть", () => {
    const serve = fs.readFileSync(path.join(RUNTIME_DIR, "serve.mjs"), "utf-8");

    expect(serve.indexOf("...memoryEnv(HERMES_HOME_DIR),")).toBeLessThan(serve.indexOf("...extraEnv,"));
  });
});

describe("D-85: каталог mem0 внутри профиля, а не ~/.mem0", () => {
  it("memoryEnv несёт телеметрию и MEM0_DIR под профилем", () => {
    const env = memoryEnv("C:\\profile");

    expect(env.MEM0_TELEMETRY).toBe("false");
    expect(env.MEM0_DIR).toBe(path.join("C:\\profile", MEM0_DIR_NAME));
  });

  it("два других запуска ядра из main-процесса называют тот же каталог", () => {
    // Main-процесс этот модуль статически не импортирует, имя продублировано —
    // читается исходник, чтобы дубликаты не разъехались молча.
    const cron = fs.readFileSync(
      path.join(RUNTIME_DIR, "..", "apps", "desktop", "src", "main", "cron-runner-pure.ts"),
      "utf-8",
    );
    const facts = fs.readFileSync(path.join(RUNTIME_DIR, "memory-facts.py"), "utf-8");

    // С 3F.D1 окружение запуска собирает `cronRunnerSpawnEnv` в `cron-runner-pure.ts`.
    expect(cron).toContain(`MEM0_DIR: join(homeDir, '${MEM0_DIR_NAME}')`);
    expect(cron).toContain("MEM0_TELEMETRY: 'false'");
    expect(facts).toContain(`os.environ.setdefault("MEM0_DIR", os.path.join(home, "${MEM0_DIR_NAME}"))`);
  });
});

describe("слияние с тем, что написало ядро", () => {
  it("чужие ключи mem0.json уцелевают — их мастер пишет в тот же файл", () => {
    const merged = buildMem0Json(
      { user_id: "чужой-идентификатор", agent_id: "hermes" },
      { baseUrl: CORE_OPENAI_BASE_URL, vectorPath: vectorStorePath(HOME) }
    );

    expect(merged.user_id).toBe("чужой-идентификатор");
    expect(merged.agent_id).toBe("hermes");
  });

  it("а наши четыре — выставляются заново поверх чужого режима", () => {
    const merged = buildMem0Json(
      { mode: "platform", oss: { llm: { provider: "ollama", config: {} } } },
      { baseUrl: CORE_OPENAI_BASE_URL, vectorPath: vectorStorePath(HOME) }
    );

    expect(merged.mode).toBe("oss");
    expect(merged.oss.llm.provider).toBe("openai");
    expect(merged.oss.llm.config.openai_base_url).toBe(CORE_OPENAI_BASE_URL);
  });
});

describe("задача 3.B4е: порог синхронизации хода", () => {
  it("стоит на верхнем уровне mem0.json — там, где его читает их initialize()", () => {
    expect(mem0().sync_max_chars).toBe(SYNC_MAX_CHARS);
    expect(SYNC_MAX_CHARS).toBe(16000);
  });

  it("выше их умолчания 450, а не равен ему: иначе ключ ничего не меняет", () => {
    expect(mem0().sync_max_chars).toBeGreaterThan(450);
  });

  it("выставляется заново поверх чужого значения", () => {
    const merged = buildMem0Json(
      { sync_max_chars: 450 },
      { baseUrl: CORE_OPENAI_BASE_URL, vectorPath: vectorStorePath(HOME) }
    );
    expect(merged.sync_max_chars).toBe(SYNC_MAX_CHARS);
  });
});

describe("задача 5.2: проектный скоуп", () => {
  const home = () => fs.mkdtempSync(path.join(os.tmpdir(), "aec-mem-"));

  it("у двух проектов ключи разные — иначе изоляции нет вовсе", () => {
    const a = projectMemoryKey(path.join(HOME, "объект-A"));
    const b = projectMemoryKey(path.join(HOME, "объект-B"));

    expect(a).not.toBe(b);
  });

  it("у одного проекта ключ один и тот же — иначе память терялась бы при каждом открытии", () => {
    const vault = path.join(HOME, "объект-A");

    expect(projectMemoryKey(vault)).toBe(projectMemoryKey(path.join(vault, ".", "")));
  });

  it("ключ не похож на их «не задано»: `hermes-user` они считают пустым", () => {
    expect(projectMemoryKey(HOME)).toMatch(/^project-[0-9a-f]{16}$/);
  });

  it("применение к профилю пишет обе стороны настройки", () => {
    const dir = home();
    const { changed, key } = applyMemoryProfile({
      hermesHomeDir: dir,
      vaultPath: path.join(HOME, "объект-A"),
      env: {},
    });

    expect(changed).toBe(true);
    expect(fs.readFileSync(path.join(dir, "config.yaml"), "utf-8")).toContain("provider: mem0");

    const written = JSON.parse(fs.readFileSync(path.join(dir, "mem0.json"), "utf-8"));
    expect(written.mode).toBe("oss");
    expect(written.user_id).toBe(key);
    expect(written.oss.llm.config.openai_base_url).toBe(CORE_OPENAI_BASE_URL);
  });

  it("повторное открытие того же проекта ничего не меняет", () => {
    const dir = home();
    const opts = { hermesHomeDir: dir, vaultPath: path.join(HOME, "объект-A"), env: {} };

    expect(applyMemoryProfile(opts).changed).toBe(true);
    expect(applyMemoryProfile(opts).changed).toBe(false);
  });

  it("переключение проекта меняет РОВНО ключ разделения", () => {
    const dir = home();
    applyMemoryProfile({ hermesHomeDir: dir, vaultPath: path.join(HOME, "объект-A"), env: {} });
    const a = JSON.parse(fs.readFileSync(path.join(dir, "mem0.json"), "utf-8"));

    applyMemoryProfile({ hermesHomeDir: dir, vaultPath: path.join(HOME, "объект-B"), env: {} });
    const b = JSON.parse(fs.readFileSync(path.join(dir, "mem0.json"), "utf-8"));

    expect(b.user_id).not.toBe(a.user_id);
    expect({ ...b, user_id: null }).toEqual({ ...a, user_id: null });
  });

  it("чужой `user_id`, записанный их мастером, замещается проектным", () => {
    // Их ключ означает ЧЕЛОВЕКА, наш — проект внутри профиля этого человека.
    // Оставить чужой значило бы отдать оба проекта в одну память.
    const dir = home();
    fs.writeFileSync(path.join(dir, "mem0.json"), JSON.stringify({ user_id: "hermes-user" }), "utf-8");

    const { key } = applyMemoryProfile({
      hermesHomeDir: dir,
      vaultPath: path.join(HOME, "объект-A"),
      env: {},
    });

    expect(JSON.parse(fs.readFileSync(path.join(dir, "mem0.json"), "utf-8")).user_id).toBe(key);
  });
});

// Задача 3G.4 (D-157): память — от выбранного провайдера.
describe("провайдер памяти по выбору человека", () => {
  const home = () => fs.mkdtempSync(path.join(os.tmpdir(), "aec-mem-"));
  const gemini = {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnvVar: "GEMINI_API_KEY",
    llmModel: "gemini-3.5-flash-lite",
    embeddingModel: "gemini-embedding-2",
    embeddingDims: 3072,
  };

  it("пишет адрес, модели и ИМЯ переменной ключа, но не ключ", () => {
    const written = buildMem0Json({}, { baseUrl: "ignored", vectorPath: "/q", provider: gemini });
    expect(written.oss.llm).toEqual({
      provider: "openai",
      config: {
        model: "gemini-3.5-flash-lite",
        openai_base_url: gemini.baseUrl,
        api_key_env: "GEMINI_API_KEY",
      },
    });
    expect(written.oss.embedder.config).toEqual({
      model: "gemini-embedding-2",
      embedding_dims: 3072,
      openai_base_url: gemini.baseUrl,
      api_key_env: "GEMINI_API_KEY",
    });
    expect(JSON.stringify(written)).not.toMatch(/"api_key"\s*:/);
  });

  it("смена модели эмбеддингов уводит в свою коллекцию — чужие факты не стираются", () => {
    const written = buildMem0Json({}, { baseUrl: "x", vectorPath: "/q", provider: gemini });
    expect(written.oss.vector_store.config).toEqual({
      path: "/q",
      collection_name: "mem0-gemini-embedding-2",
    });
    expect(memoryCollection("text-embedding-3-small")).toBe("mem0");
  });

  it("без провайдера — прежняя настройка, байт в байт", () => {
    expect(buildMem0Json({}, { baseUrl: "u", vectorPath: "/q", provider: null })).toEqual(
      buildMem0Json({}, { baseUrl: "u", vectorPath: "/q" }),
    );
  });

  it("применение к профилю пишет провайдера на диск", () => {
    const dir = home();
    applyMemoryProfile({
      hermesHomeDir: dir,
      vaultPath: path.join(HOME, "объект-A"),
      env: {},
      provider: gemini,
    });
    const written = JSON.parse(fs.readFileSync(path.join(dir, "mem0.json"), "utf-8"));
    expect(written.oss.llm.config.api_key_env).toBe("GEMINI_API_KEY");
  });
});
