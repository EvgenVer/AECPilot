// Гейт на СТЫК ДВУХ ЯЗЫКОВ (задача 5.16): факты памяти читает python, а разбирает
// его ответ TypeScript.
//
// ЗАЧЕМ ОН НУЖЕН. Тест чистого модуля стоит на ЗАМЕРЕННОЙ строке читателя — то
// есть на копии, — а питоновского теста у читателя нет: в `runtime/` ни один тест
// не запускает python ядра, и заводить этот обычай ради одного файла дороже, чем
// сверить имена текстом. Переименование поля с одной стороны не заметил бы никто:
// окно показало бы пустой список вместо фактов, не сказав ни слова.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUNTIME_DIR } from "./hermes-env.mjs";

const reader = readFileSync(join(RUNTIME_DIR, "memory-facts.py"), "utf8");
const parser = readFileSync(
  join(RUNTIME_DIR, "..", "apps", "desktop", "src", "main", "memory-facts-pure.ts"),
  "utf8",
);

describe("стык читателя памяти и его разбора", () => {
  it("поля ответа называются одинаково по обе стороны", () => {
    // Проверяется СБОРКА ответа, а не наличие слова в файле, и запятая в конце —
    // не придирка: имя `user_id` стоит в читателе ещё и фильтром mem0
    // (`filters={"user_id": provider._user_id})`), поэтому проверка без запятой
    // пропускала переименование выходного поля насквозь. Это показали две
    // контрольные мутации: первая прошла мимо гейта, и гейт пришлось ужесточить.
    expect(reader).toMatch(/"user_id": provider\._user_id,/);
    expect(reader).toContain('"facts": facts_of(');
    expect(reader).toContain('answer = {"ok": problem is None, "deleted": ident}');
    expect(parser).toContain("parsed.ok");
    expect(parser).toContain("parsed.user_id");
    expect(parser).toContain("parsed.facts");
    expect(parser).toContain("parsed.error");
  });

  it("факт несёт ровно те поля, которые читает окно", () => {
    // Слева — наше имя, справа — их: `text` собирается из их `memory`, и молчаливая
    // замена одного на другое оставила бы список без текста.
    expect(reader).toContain('"id": item.get("id"');
    expect(reader).toContain('"text": item.get("memory"');
    expect(reader).toContain('"created_at": item.get("created_at"');
    expect(reader).toContain('"channel": metadata.get("channel"');
    for (const key of ["row.id", "row.text", "row.created_at", "row.channel"]) {
      expect(parser).toContain(key);
    }
    // ЗАМЕР 5.16: поля `session` в записи НЕТ — провайдер пишет в метаданные
    // только канал. Пустое поле на экране читалось бы как потерянный факт.
    expect(reader).not.toContain('"session"');
  });

  it("список берётся через filters=, а не user_id= — иначе mem0 отвечает отказом", () => {
    // Замер на mem0 2.0.10: `get_all(user_id=...)` → «Top-level entity parameters
    // frozenset({'user_id'}) are not supported in get_all(). Use filters={...}».
    // Возврат к короткой форме сломал бы список целиком.
    expect(reader).toContain("get_all(filters=");
  });

  it("удаление идёт ИХ инструментом, а не нашей правкой хранилища", () => {
    // Форма записи принадлежит их провайдеру: своё удаление разошлось бы с их
    // журналом и с тем, как факт исчезает из recall.
    expect(reader).toContain("mem0_delete");
  });
});
