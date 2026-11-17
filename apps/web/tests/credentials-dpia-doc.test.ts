import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dpia = readFileSync(resolve(here, "../../../docs/DPIA_ROEBEL_APP.md"), "utf8");

function has(text: string, ...needles: string[]) {
  for (const n of needles) assert.ok(text.includes(n), `DPIA is missing: ${n}`);
}

test("DPIA names OrgRegistry and its RoleSet logs", () => {
  has(dpia, "OrgRegistry", "0x320b4e", "RoleSet", "Fraktion");
});

test("DPIA names what the credential register shows and hides", () => {
  has(dpia, "Credential-Register", "Batch-Größe", "gesalzenes Commitment", "Konto ↔ Ausweis");
});

test("DPIA covers the public/private switches", () => {
  has(
    dpia,
    "Öffentlich zeigen",
    "Privat behalten",
    "Mitglieder dürfen öffentlich sichtbar sein",
    "Chain-Historie",
  );
});

test("DPIA covers mirror tables and one-time e-mail use", () => {
  has(dpia, "credential_invitations", "credential_actions", "credential_presentations", "E-Mail-Adresse", "nach einmaligem Versand gelöscht");
});

test("DPIA states the permanence limits and the legal-review mark", () => {
  has(dpia, "bleibt in der Chain-Historie", "nie beanspruchter", "Art. 9", "keine Rechtsberatung", "Rechtsprüfung");
});
