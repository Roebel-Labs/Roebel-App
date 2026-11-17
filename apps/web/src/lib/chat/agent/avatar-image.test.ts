import { test } from "node:test";
import assert from "node:assert/strict";
import { customAgentPrompt, isAllowedAvatarUrl } from "./avatar-image";

const SB = "https://abcd.supabase.co";
const UPLOAD = `${SB}/storage/v1/object/public/images/chat/avatars/7d3c1a6e-1111-4c3a-9e8f-0a1b2c3d4e5f.webp`;

test("own uploads and house artwork are allowed", () => {
  assert.equal(isAllowedAvatarUrl(UPLOAD, SB), true);
  assert.equal(isAllowedAvatarUrl("https://www.roebel.app/agents/olli/tile.webp", SB), true);
  assert.equal(isAllowedAvatarUrl("https://roebel.app/agents/mecky/tile.webp", SB), true);
  assert.equal(isAllowedAvatarUrl("https://www.roebel.app/mascot/mecky-mail.png", SB), true);
});

test("everything else is dropped", () => {
  for (const bad of [
    "http://www.roebel.app/agents/olli/tile.webp",
    "https://evil.example/agents/olli/tile.webp",
    "https://www.roebel.app/api/chat/me",
    "https://www.roebel.app/agents/olli/tile.webp?x=1",
    `${SB}/storage/v1/object/public/images/other/7d3c1a6e-1111-4c3a-9e8f-0a1b2c3d4e5f.webp`,
    `${SB}/storage/v1/object/sign/chat-media/x/7d3c1a6e-1111-4c3a-9e8f-0a1b2c3d4e5f.webp`,
    `https://other.supabase.co/storage/v1/object/public/images/chat/avatars/7d3c1a6e-1111-4c3a-9e8f-0a1b2c3d4e5f.webp`,
    "https://www.roebel.app/agents/../secret.png",
    "javascript:alert(1)",
    42,
    null,
  ]) {
    assert.equal(isAllowedAvatarUrl(bad, SB), false, String(bad));
  }
});

test("custom agent prompt names the role when given", () => {
  assert.match(customAgentPrompt("Hanne", "hilft mir beim Vereinsvorstand"), /Du bist Hanne\. .*Vereinsvorstand/);
  assert.match(customAgentPrompt("Hanne", " "), /selbst eingerichtet/);
});
