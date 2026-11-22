#!/usr/bin/env node
// Animated agent artwork: two short loops per character, made with GPT Image 2.6 on kie.ai from the live tile.
//
//   idle.webp    — blink, small breath and a friendly gesture (played now and then)
//   writing.webp — the character scribbles on a notepad (played while the agent answers)
//
// Usage (from the repo root):
//   KIE_API_KEY=… NODE_PATH=node_modules/.pnpm/sharp@0.34.5/node_modules \
//     node apps/web/scripts/gen-agent-animations.mjs [ids…] [--only idle|writing] [--raw <dir>]
//
// The key is read from KIE_API_KEY or apps/web/.env.local (gitignored). Raw GIFs land in --raw (default: the OS
// temp dir) so a bad take can be re-encoded without paying again; the encoded loops go to
// apps/web/public/agents/<id>/<kind>.webp (320 px, animated WebP, infinite loop).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'agents');
const ORIGIN = 'https://www.roebel.app';
const IDS = ['mecky', 'wolke', 'pilzi', 'fritz', 'lumi', 'eiko', 'lilo', 'olli', 'otto', 'ida', 'stine', 'mari', 'klaas'];

const KEEP =
  'Keep the character design, proportions, colours, painterly illustration style and framing exactly as in the image. ' +
  'Keep the flat background colour exactly the same and fully flat. Static camera, the character stays centred and ' +
  'the same size in every frame. No text, no extra objects except those described.';

const PROMPTS = {
  idle:
    'Animate this exact character as a seamless looping animation: a calm, friendly idle loop. It breathes gently, ' +
    'blinks once and makes one small happy gesture, then returns exactly to the starting pose so the loop is seamless. ' +
    KEEP,
  writing:
    'Animate this exact character as a seamless looping animation: it is busy writing a message. It holds a small ' +
    'pencil and scribbles on a little paper notepad, glancing down at it with a focused, cheerful face, small ' +
    'rhythmic writing motion. The first and last frame match so the loop is seamless. ' +
    KEEP,
};

function readKey() {
  if (process.env.KIE_API_KEY) return process.env.KIE_API_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const m = /^KIE_API_KEY=(.+)$/m.exec(env);
    if (m) return m[1].trim();
  } catch {}
  throw new Error('KIE_API_KEY missing (env or apps/web/.env.local)');
}

const KEY = readKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kie(pathname, init) {
  const res = await fetch(`https://api.kie.ai/api/v1${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (body.code !== 200) throw new Error(`kie ${pathname}: ${body.code} ${body.msg}`);
  return body.data;
}

async function generate(id, kind) {
  const { taskId } = await kie('/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-image-2-6/sunburst-image-to-image',
      input: {
        prompt: PROMPTS[kind],
        input_urls: [`${ORIGIN}/agents/${id}/tile.webp`],
        aspect_ratio: '1:1',
        resolution: '1K',
        quality: 'medium',
        background: 'auto',
        output_format: 'gif',
        frame_count: '16',
        frame_duration_ms: 110,
      },
    }),
  });
  for (let i = 0; i < 90; i++) {
    await sleep(8000);
    const d = await kie(`/jobs/recordInfo?taskId=${taskId}`);
    if (d.state === 'success') return JSON.parse(d.resultJson).resultUrls[0];
    if (d.state === 'fail') throw new Error(`${id}/${kind} failed: ${d.failMsg}`);
  }
  throw new Error(`${id}/${kind} timed out (${taskId})`);
}

async function encode(gifPath, outPath) {
  await sharp(gifPath, { animated: true })
    .resize(320, 320, { fit: 'cover' })
    .webp({ quality: 72, effort: 6, loop: 0 })
    .toFile(outPath);
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args.splice(onlyIdx, 2)[1] : null;
  const rawIdx = args.indexOf('--raw');
  const rawDir = rawIdx >= 0 ? args.splice(rawIdx, 2)[1] : path.join(os.tmpdir(), 'agent-animations');
  const ids = args.length ? args : IDS;
  const kinds = only ? [only] : Object.keys(PROMPTS);
  fs.mkdirSync(rawDir, { recursive: true });

  const jobs = ids.flatMap((id) => kinds.map((kind) => ({ id, kind })));
  const results = await Promise.allSettled(
    jobs.map(async ({ id, kind }, i) => {
      await sleep(i * 700); // stay well under the createTask rate limit
      const url = await generate(id, kind);
      const gif = path.join(rawDir, `${id}-${kind}.gif`);
      fs.writeFileSync(gif, Buffer.from(await (await fetch(url)).arrayBuffer()));
      fs.mkdirSync(path.join(OUT, id), { recursive: true });
      const out = path.join(OUT, id, `${kind}.webp`);
      await encode(gif, out);
      console.log(`✓ ${id}/${kind}.webp ${Math.round(fs.statSync(out).size / 1024)} KB`);
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected');
  failed.forEach((r) => console.error('✗', r.reason?.message ?? r.reason));
  process.exitCode = failed.length ? 1 : 0;
}

main();
