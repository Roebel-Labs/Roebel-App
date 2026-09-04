#!/usr/bin/env node
// apps/web/scripts/event-radio-setup.mjs
// One-off setup for the Wochen-Radio (spec section 8). Run from apps/web:
//   node --env-file=.env.local scripts/event-radio-setup.mjs voice-preview --out ../../output/event-radio
//   node --env-file=.env.local scripts/event-radio-setup.mjs voice-create --generated-voice-id <id> --name Mecky
//   node --env-file=.env.local scripts/event-radio-setup.mjs bed --seconds 90 --out ../../output/event-radio [--upload]
// Needs ELEVENLABS_API_KEY; `bed --upload` also needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from "node:fs/promises"
import path from "node:path"

const BASE = "https://api.elevenlabs.io"

const DEFAULT_VOICE_DESCRIPTION =
  "Warm, friendly male voice in his late thirties, a relaxed northern German local radio host from Mecklenburg. Clear articulation, a gentle smile in the voice, medium-low pitch, unhurried pace, natural and trustworthy, never salesy."

const DEFAULT_SAMPLE_TEXT =
  "Moin Röbel! Hier ist Mecky mit dem Wochen-Radio. Am Samstag ab vierzehn Uhr gibt es am Hafen Musik, Bratwurst und gute Laune, und am Sonntag lädt die Bibliothek zur Lesung ein. Kommt vorbei, ich freu mich auf euch!"

const DEFAULT_BED_PROMPT =
  "Warm, laid-back acoustic bed for a small-town local radio show: soft fingerpicked guitar, light brushed percussion, a hint of upright bass, unobtrusive and loopable, steady relaxed mood, no vocals, no melody hooks that fight with speech."

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  return v === undefined || v.startsWith("--") ? true : v
}

function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Fehlt: ${name}`)
    process.exit(1)
  }
  return v
}

async function elevenJson(pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "xi-api-key": requireEnv("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res
}

async function ensureOut() {
  const out = arg("out")
  if (!out || out === true) {
    console.error("--out <dir> ist Pflicht")
    process.exit(1)
  }
  await fs.mkdir(out, { recursive: true })
  return out
}

async function voicePreview() {
  const out = await ensureOut()
  const description = arg("description", DEFAULT_VOICE_DESCRIPTION)
  const text = arg("text", DEFAULT_SAMPLE_TEXT)
  const res = await elevenJson("/v1/text-to-voice/design", {
    voice_description: description,
    text,
    model_id: "eleven_multilingual_ttv_v2",
    auto_generate_text: false,
  })
  const json = await res.json()
  const previews = json.previews ?? []
  for (const [i, p] of previews.entries()) {
    const b64 = p.audio_base_64 ?? p.audio_base64
    const file = path.join(out, `mecky-preview-${i + 1}.mp3`)
    await fs.writeFile(file, Buffer.from(b64, "base64"))
    console.log(`${file}\n  generated_voice_id: ${p.generated_voice_id}`)
  }
  console.log(`\n${previews.length} Previews. Anhören, dann: voice-create --generated-voice-id <id> --name Mecky`)
}

async function voiceCreate() {
  const generatedVoiceId = arg("generated-voice-id")
  if (!generatedVoiceId || generatedVoiceId === true) {
    console.error("--generated-voice-id <id> ist Pflicht")
    process.exit(1)
  }
  const res = await elevenJson("/v1/text-to-voice", {
    voice_name: arg("name", "Mecky"),
    voice_description: arg("description", DEFAULT_VOICE_DESCRIPTION),
    generated_voice_id: generatedVoiceId,
  })
  const json = await res.json()
  console.log(`voice_id: ${json.voice_id}\nIn /admin/dashboard/events unter Wochen-Radio eintragen.`)
}

async function bed() {
  const out = await ensureOut()
  const seconds = Number(arg("seconds", "90"))
  const res = await elevenJson("/v1/music?output_format=mp3_44100_128", {
    prompt: arg("prompt", DEFAULT_BED_PROMPT),
    music_length_ms: Math.round(seconds * 1000),
    model_id: "music_v2",
    force_instrumental: true,
  })
  const audio = Buffer.from(await res.arrayBuffer())
  const file = path.join(out, "wochen-radio-bed.mp3")
  await fs.writeFile(file, audio)
  console.log(`${file} (${Math.round(audio.length / 1024)} KB)`)
  if (arg("upload") === true) {
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
    const objectPath = "global/wochen-radio-bed.mp3"
    const { error } = await supabase.storage
      .from("story-audio")
      .upload(objectPath, audio, { contentType: "audio/mpeg", cacheControl: "3600", upsert: true })
    if (error) throw new Error(`Upload: ${error.message}`)
    const url = supabase.storage.from("story-audio").getPublicUrl(objectPath).data.publicUrl
    const { error: settingError } = await supabase
      .from("app_settings")
      .upsert({ key: "event_stories_audio_url", value: url, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (settingError) throw new Error(`app_settings: ${settingError.message}`)
    console.log(`Hochgeladen und als Hintergrund-Audio gesetzt:\n${url}`)
  }
}

const command = process.argv[2]
const commands = { "voice-preview": voicePreview, "voice-create": voiceCreate, bed }
if (!commands[command]) {
  console.error(`Nutzung: event-radio-setup.mjs <${Object.keys(commands).join("|")}> [--out <dir>] ...`)
  process.exit(1)
}
commands[command]().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
