// Records the narration with ElevenLabs as ONE take (so the delivery stays even from scene to
// scene), cuts it into one clip per scene and writes the line timings.
// Usage, from the project root:
//   ELEVENLABS_API_KEY=… node scripts/voice.mjs <slug> <voiceId>
// Output: voices/<slug>/full.mp3 (to listen), voices/<slug>/<scene>.mp3, voices/<slug>/voice.json.
// To use a take in the video: copy its scene clips to public/voice/ and voice.json to src/.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const [slug, voiceId] = process.argv.slice(2);
const key = process.env.ELEVENLABS_API_KEY;
if (!slug || !voiceId) throw new Error('usage: node scripts/voice.mjs <slug> <voiceId>');
if (!key) throw new Error('ELEVENLABS_API_KEY is not set');

// The narration lives in src/script.ts; read the scenes out of it so there is one source of text.
const source = await readFile('src/script.ts', 'utf8');
const scenes = [...source.matchAll(/id: '(\w+)',[\s\S]*?lines: \[([\s\S]*?)\],\n  \}/g)].map((m) => ({
  id: m[1],
  lines: [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((l) => l[1]),
}));
if (scenes.length !== 7) throw new Error(`expected 7 scenes, parsed ${scenes.length}`);

const SCENE_BREAK = '\n\n';
const text = scenes.map((scene) => scene.lines.join(' ')).join(SCENE_BREAK);
const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
  method: 'POST',
  headers: { 'xi-api-key': key, 'content-type': 'application/json' },
  body: JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    // High stability keeps the read calm; low style avoids the pushed, shouty register.
    voice_settings: { stability: 0.7, similarity_boost: 0.75, style: 0, speed: 1 },
  }),
});
if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
const { audio_base64, alignment } = await res.json();
const starts = alignment.character_start_times_seconds;
const ends = alignment.character_end_times_seconds;
if (starts.length !== text.length) throw new Error(`alignment has ${starts.length} characters, text has ${text.length}`);

const dir = `voices/${slug}`;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/full.mp3`, Buffer.from(audio_base64, 'base64'));

// Character windows of every line, then cut points in the silence between scenes.
let offset = 0;
const timed = scenes.map((scene) => {
  const lines = scene.lines.map((line) => {
    const window = { start: starts[offset], end: ends[offset + line.length - 1] };
    offset += line.length + 1;
    return window;
  });
  offset += SCENE_BREAK.length - 1;
  return { id: scene.id, lines };
});
const total = ends[ends.length - 1];
const out = {};
timed.forEach((scene, i) => {
  const first = scene.lines[0].start;
  const last = scene.lines[scene.lines.length - 1].end;
  const cutIn = i === 0 ? 0 : Math.max((timed[i - 1].lines.at(-1).end + first) / 2, first - 0.15);
  const cutOut = i === timed.length - 1 ? total + 0.3 : Math.min((last + timed[i + 1].lines[0].start) / 2, last + 0.4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/full.mp3`, '-ss', cutIn.toFixed(3), '-to', cutOut.toFixed(3), '-af', 'afade=t=in:d=0.02', '-b:a', '128k', `${dir}/${scene.id}.mp3`]);
  out[scene.id] = {
    seconds: +(last - cutIn).toFixed(3),
    lines: scene.lines.map((l) => ({ start: +(l.start - cutIn).toFixed(3), end: +(l.end - cutIn).toFixed(3) })),
  };
});
await writeFile(`${dir}/voice.json`, JSON.stringify(out, null, 2) + '\n');
console.log(slug, total.toFixed(1), 's');
