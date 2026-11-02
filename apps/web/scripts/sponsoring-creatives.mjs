#!/usr/bin/env node
// Pre-generates personal AI ad cards (16:9) for the DanceCup livestream sponsoring page, one or
// more per organisation, so each org sees ITS OWN ad the moment it opens the page.
//
// Image generation goes through the `kie-proxy` edge function (SUPABASE_SEED_TOKEN), same model
// as lib/images/kie.ts (nano-banana-2-lite). Each call is logged to ai_usage_events.
//
//   node scripts/sponsoring-creatives.mjs --orgs <id,id,...> [--variants 2] [--out <dir>] [--store]
//   node scripts/sponsoring-creatives.mjs --all [--variants 2] --store
//
// --out   writes PNGs locally (for review); --store uploads to the public `images` bucket under
//         sponsoring/creatives/ and inserts rows into sponsoring_creatives.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(path.join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MODEL = "nano-banana-2-lite";
const CAMPAIGN_SLUG = "dancecup-2026";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const VARIANTS = Number(arg("--variants") ?? 1);
const OUT = arg("--out");
const STORE = args.includes("--store");

const KIND = {
  verein: "ein Verein", restaurant: "ein Restaurant / Gastronomie", unternehmen: "ein lokales Unternehmen",
  fraktion: "eine politische Gruppe", stadt: "ein städtisches Angebot",
};
const TAGLINES = [
  "Wir wünschen allen Tänzerinnen und Tänzern viel Erfolg!",
  "Mit Herz dabei – beim DanceCup Röbel",
];

function prompt(org, hasLogo, variant) {
  const style = variant % 2 === 0
    ? "Bold modern sponsor card: large logo on a clean solid background in the logo's main colour, subtle diagonal light streaks like stage lights."
    : "Elegant evening-gala sponsor card: deep dark background with soft warm spotlights and a faint dance-floor bokeh, logo on a light rounded panel.";
  return [
    `Design a professional 16:9 sponsor slide for the live broadcast of a regional dance competition ("DanceCup Röbel").`,
    `The sponsor is "${org.name}" (${KIND[org.sub_type] ?? "eine Organisation"} aus Röbel/Müritz).`,
    hasLogo
      ? "Use the attached logo EXACTLY as provided: do not redraw, re-letter, recolour or distort it. Place it prominently."
      : `There is no logo: create a clean, timeless typographic wordmark of the name "${org.name}".`,
    `Show the name "${org.name}" once in clear, correctly spelled lettering.`,
    `Add exactly one short German line in smaller type: "${TAGLINES[variant % TAGLINES.length]}"`,
    style,
    "Keep generous margins (broadcast safe area), high contrast, no other text, no website, no phone number, no watermark, no people's faces.",
  ].join(" ");
}

async function kie(req) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/kie-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-seed-token": env.SUPABASE_SEED_TOKEN },
    body: JSON.stringify(req),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`kie-proxy ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function generate(promptText, imageUrls) {
  const created = await kie({ action: "createTask", payload: { model: MODEL, input: { prompt: promptText, image_urls: imageUrls, aspect_ratio: "16:9" } } });
  const taskId = created?.data?.taskId;
  if (!taskId) throw new Error(`no taskId: ${JSON.stringify(created)}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const info = await kie({ action: "recordInfo", taskId });
    const d = info?.data;
    if (d?.state === "success") return JSON.parse(d.resultJson).resultUrls[0];
    if (d?.state === "fail") throw new Error(d.failMsg || "failed");
  }
  throw new Error("timeout");
}

async function main() {
  let q = db.from("accounts").select("id, name, sub_type, avatar_url").eq("account_type", "organisation");
  if (!args.includes("--all")) q = q.in("id", (arg("--orgs") ?? "").split(",").filter(Boolean));
  const { data: orgs, error } = await q;
  if (error) throw error;
  const { data: campaign } = STORE
    ? await db.from("sponsoring_campaigns").select("id").eq("slug", CAMPAIGN_SLUG).single()
    : { data: null };
  if (OUT) fs.mkdirSync(OUT, { recursive: true });

  const one = async (org) => {
    const hasLogo = !!org.avatar_url;
    for (let v = 0; v < VARIANTS; v++) {
      const t0 = Date.now();
      try {
        const url = await generate(prompt(org, hasLogo, v), hasLogo ? [org.avatar_url] : []);
        const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
        // KI-Kosten ledger: same pricing as lib/ai-usage/pricing.ts (kie:nano-banana-2-lite = $0.02/image).
        await db.from("ai_usage_events").insert({
          source: "web", feature: "sponsoring.creative", provider: "kie", model: MODEL,
          input_tokens: 0, output_tokens: 0, units: 1, unit_type: "image", cost_micros: 20_000,
        }).then(() => undefined, () => undefined);
        if (OUT) fs.writeFileSync(path.join(OUT, `${org.name.replace(/[^\w-]+/g, "_")}-${v}.png`), bytes);
        if (STORE && campaign) {
          const p = `sponsoring/creatives/${org.id}-${v}-${Date.now()}.png`;
          const up = await db.storage.from("images").upload(p, bytes, { contentType: "image/png", cacheControl: "31536000" });
          if (up.error) throw up.error;
          const imageUrl = db.storage.from("images").getPublicUrl(p).data.publicUrl;
          const ins = await db.from("sponsoring_creatives").insert({
            campaign_id: campaign.id, org_account_id: org.id, image_url: imageUrl, variant: v,
            source: hasLogo ? "ai_logo" : "ai_wordmark",
          });
          if (ins.error) throw ins.error;
        }
        console.log(`ok   ${org.name} #${v} (${Math.round((Date.now() - t0) / 1000)} s)`);
      } catch (err) {
        console.log(`FAIL ${org.name} #${v}: ${err.message}`);
      }
    }
  };
  // 4 orgs at a time: kie.ai handles parallel tasks; keeps the full run around 10 minutes.
  const queue = [...orgs];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));
}

main().catch((e) => { console.error(e); process.exit(1); });
