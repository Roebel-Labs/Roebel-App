import { test } from "node:test";
import assert from "node:assert/strict";
import type { LookupAddress } from "node:dns";
import { assertFetchableUrl, guardedFetch, guardedLookup, htmlToReadable, isPrivateAddress } from "./web";

test("isPrivateAddress blocks private, loopback, link-local and reserved ranges", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fd00::1", "fc00::abcd", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:7f00:1", "64:ff9b::a00:1", "ff02::1", "2001:db8::1", "not-an-ip",
  ]) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("assertFetchableUrl: https only, no creds, no odd ports, no internal hosts", () => {
  assert.equal(assertFetchableUrl("https://www.roebel.app/x").hostname, "www.roebel.app");
  for (const u of [
    "http://example.com", "ftp://example.com", "file:///etc/passwd", "https://user:pw@example.com",
    "https://example.com:8443/", "https://localhost/", "https://127.0.0.1/", "https://[::1]/",
    "https://169.254.169.254/latest/meta-data", "https://intranet/", "https://printer.local/", "nonsense",
  ]) assert.throws(() => assertFetchableUrl(u), u);
});

const fakeResolve = (map: Record<string, string[]>) =>
  ((host: string, _opts: unknown, cb: (e: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) => {
    const ips = map[host];
    if (!ips) return cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []);
    cb(null, ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  }) as never;

test("guardedLookup rejects hosts that resolve to private IPs (DNS rebinding)", async () => {
  const lookup = guardedLookup(fakeResolve({ "evil.example": ["93.184.216.34", "127.0.0.1"], "ok.example": ["93.184.216.34"] }));
  await new Promise<void>((done) =>
    lookup("evil.example", {}, (err) => {
      assert.ok(err);
      assert.equal(err?.code, "EBLOCKED");
      done();
    }),
  );
  await new Promise<void>((done) =>
    lookup("ok.example", {}, (err, addr) => {
      assert.equal(err, null);
      assert.equal(addr, "93.184.216.34");
      done();
    }),
  );
});

test("guardedFetch refuses a public-looking host that resolves internally", async () => {
  await assert.rejects(
    guardedFetch("https://metadata.example/", { resolve: fakeResolve({ "metadata.example": ["169.254.169.254"] }) }),
    /Interne Adressen/,
  );
});

test("htmlToReadable prefers <article>, drops scripts/nav, reads meta", () => {
  const article = `<article><h1>Stadtfest</h1><p>${"Das Stadtfest findet am Markt statt. ".repeat(20)}</p><script>evil()</script></article>`;
  const html = `<html><head><title>T &amp; X</title><meta property="og:description" content="Beschreibung"></head>
    <body><nav>Menü Menü</nav>${article}<footer>Impressum</footer></body></html>`;
  const r = htmlToReadable(html);
  assert.equal(r.title, "T & X");
  assert.equal(r.description, "Beschreibung");
  assert.ok(r.text.startsWith("Stadtfest"));
  assert.ok(!r.text.includes("evil"));
  assert.ok(!r.text.includes("Menü"));
  assert.equal(r.truncated, false);
  const long = htmlToReadable(`<body><p>${"x".repeat(30_000)}</p></body>`, 1000);
  assert.equal(long.truncated, true);
  assert.ok(long.text.length < 1100);
});
