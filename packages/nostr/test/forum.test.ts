import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyEvent } from "../src/events";
import {
  KIND_FORUM_CATEGORY,
  KIND_FORUM_REPLY,
  KIND_FORUM_THREAD,
  buildForumCategoryEvent,
  buildForumReplyEvent,
  buildForumThreadEvent,
  forumCategoryAddress,
} from "../src/forum";
import { deriveNostrSecretKey, getPublicKeyHex } from "../src/keys";

const SIGNATURE =
  "0x" +
  "9c1f2b3a4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8" +
  "1b2c3d4e5f60718293a4b5c6d7e8f9001a2b3c4d5e6f708192a3b4c5d6e7f809" +
  "1b";
const SECRET_KEY = deriveNostrSecretKey(SIGNATURE);
const PUBKEY = getPublicKeyHex(SECRET_KEY);
const CREATED_AT = 1_756_400_000;
const ROOT_ID = "a".repeat(64);
const PARENT_ID = "b".repeat(64);

describe("forum category (kind 32107)", () => {
  it("builds an addressable category definition", () => {
    const event = buildForumCategoryEvent(
      SECRET_KEY,
      { slug: "verkehr", name: "Verkehr", about: "Straßen, Wege, ÖPNV" },
      { createdAt: CREATED_AT },
    );
    assert.equal(event.kind, KIND_FORUM_CATEGORY);
    assert.deepEqual(event.tags.find((t) => t[0] === "d"), ["d", "category:verkehr"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "name"), ["name", "Verkehr"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "about"), ["about", "Straßen, Wege, ÖPNV"]);
    assert.ok(verifyEvent(event));
  });

  it("rejects an invalid slug", () => {
    assert.throws(() => buildForumCategoryEvent(SECRET_KEY, { slug: "Verkehr!", name: "x" }));
    assert.throws(() => buildForumCategoryEvent(SECRET_KEY, { slug: "", name: "x" }));
  });

  it("derives the a-tag address", () => {
    assert.equal(
      forumCategoryAddress(PUBKEY, "verkehr"),
      `32107:${PUBKEY}:category:verkehr`,
    );
  });
});

describe("forum thread (kind 11)", () => {
  it("carries title tag and body content", () => {
    const event = buildForumThreadEvent(
      SECRET_KEY,
      { title: "Radweg zur Müritz", content: "Der Radweg endet abrupt …" },
      { createdAt: CREATED_AT },
    );
    assert.equal(event.kind, KIND_FORUM_THREAD);
    assert.deepEqual(event.tags.find((t) => t[0] === "title"), ["title", "Radweg zur Müritz"]);
    assert.equal(event.content, "Der Radweg endet abrupt …");
    assert.equal(event.tags.find((t) => t[0] === "t"), undefined);
    assert.ok(verifyEvent(event));
  });

  it("attaches the optional category as a t tag", () => {
    const event = buildForumThreadEvent(
      SECRET_KEY,
      { title: "Radweg", content: "…", categorySlug: "verkehr" },
      { createdAt: CREATED_AT },
    );
    assert.deepEqual(event.tags.find((t) => t[0] === "t"), ["t", "verkehr"]);
  });

  it("rejects an empty title and an invalid category slug", () => {
    assert.throws(() => buildForumThreadEvent(SECRET_KEY, { title: "  ", content: "x" }));
    assert.throws(() =>
      buildForumThreadEvent(SECRET_KEY, { title: "ok", content: "x", categorySlug: "Bad Slug" }),
    );
  });
});

describe("forum reply (kind 1111, NIP-22)", () => {
  it("scopes a top-level reply to the thread root with E/K/P and mirrors it lowercase", () => {
    const event = buildForumReplyEvent(
      SECRET_KEY,
      "Gute Idee!",
      { id: ROOT_ID, pubkey: PUBKEY },
      undefined,
      { createdAt: CREATED_AT },
    );
    assert.equal(event.kind, KIND_FORUM_REPLY);
    assert.deepEqual(event.tags.find((t) => t[0] === "E"), ["E", ROOT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "K"), ["K", "11"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "P"), ["P", PUBKEY]);
    // No explicit parent → the root IS the parent.
    assert.deepEqual(event.tags.find((t) => t[0] === "e"), ["e", ROOT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "k"), ["k", "11"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "p"), ["p", PUBKEY]);
    assert.ok(verifyEvent(event));
  });

  it("points the lowercase tags at a nested parent while keeping the root scope", () => {
    const event = buildForumReplyEvent(
      SECRET_KEY,
      "Antwort auf Antwort",
      { id: ROOT_ID, pubkey: PUBKEY },
      { id: PARENT_ID, pubkey: PUBKEY, kind: 1111 },
      { createdAt: CREATED_AT },
    );
    assert.deepEqual(event.tags.find((t) => t[0] === "E"), ["E", ROOT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "e"), ["e", PARENT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "k"), ["k", "1111"]);
  });
});
