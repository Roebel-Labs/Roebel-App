import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AGENT_CHARACTERS, characterArt, characterById, characterPrompt, characterRoleLine } from "./characters";
import { normalizeAvatar } from "../store";

test("every character has its artwork in public/", () => {
  for (const c of AGENT_CHARACTERS) {
    for (const p of Object.values(characterArt(c.id))) assert.ok(existsSync(join(process.cwd(), "public", p)), `${c.id}: ${p}`);
  }
});

test("avatars keep a known character and personality, drop unknown ones", () => {
  assert.deepEqual(normalizeAvatar({ shape: "circle", color: "#AFD6D2", eyes: "dots", character: "otto", personality: "locker" }),
    { shape: "circle", color: "#AFD6D2", eyes: "dots", character: "otto", personality: "locker" });
  const bad = normalizeAvatar({ character: "duke", personality: "evil" });
  assert.equal(bad.character, undefined);
  assert.equal(bad.personality, undefined);
});

test("role line and prompt are gendered and named", () => {
  const ida = characterById("ida")!;
  assert.equal(characterRoleLine(ida), "Agentin für Nachbarschaftshilfe und Fürsorge");
  assert.match(characterPrompt(characterById("otto")!, "Duke"), /^Du bist Duke, der Otter, Agent für/);
});
