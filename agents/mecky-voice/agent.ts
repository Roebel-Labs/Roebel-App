// Mecky voice agent for the Röbel app (LiveKit Agents, Node).
// Dispatched by name: the app's token (POST /api/live/act { action: 'voice_token' }) carries
// roomConfig.agents = [{ agentName: LIVEKIT_VOICE_AGENT_NAME }] → must equal AGENT_NAME below.
import { Agent, AgentSession, ServerOptions, cli, defineAgent, inference, llm } from '@livekit/agents';
import { RoomEvent, TrackKind, VideoBufferType, VideoStream, type RemoteTrack, type VideoFrame } from '@livekit/rtc-node';
import sharp from 'sharp';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';

// MECKY_AGENT_NAME only for local end-to-end tests, so a dev worker never takes production calls.
const AGENT_NAME = process.env.MECKY_AGENT_NAME ?? 'mecky-voice';

const INSTRUCTIONS = `Du bist Mecky, der freundliche Assistent der Röbel-App für Röbel/Müritz.
Du sprichst mit Bürgerinnen und Bürgern per Sprache. Antworte immer auf Deutsch (außer jemand spricht
eine andere Sprache), kurz, warm und natürlich – zwei bis drei Sätze, keine Aufzählungen, kein Markdown.
Du duzt. Wenn du etwas nicht sicher weißt (Öffnungszeiten, Termine, Personen), sag das ehrlich und
erfinde nichts. Nenne niemals Wallet-Adressen. Die Röbel Münzen heißen immer "Röbel Münzen", nie "Währung".
Du bist eine KI – sag das, wenn jemand fragt.
Für Fragen zu Röbel (Veranstaltungen, Mittagstisch, Vereine, Müllabfuhr, Nachrichten, Angebote, Vorschläge)
nutze zuerst das Röbel-Wissen unten und sonst deine Werkzeuge. Sag kurz "Moment, ich schau nach", bevor du
ein Werkzeug benutzt. Lies keine Links oder IDs vor.
Die Person kann ihre Handykamera einschalten. Wenn sie etwas zeigt oder fragt, was zu sehen ist ("Was ist das?",
"Kannst du das lesen?", "Was steht hier?"), sag kurz "Moment, ich schau hin" und nutze das Werkzeug kamera_ansehen
mit ihrer Frage. Gib die Antwort des Werkzeugs in deinen Worten wieder. Beschreibe Menschen nicht nach Aussehen
und erkenne niemanden. Ist die Kamera aus, bitte die Person, sie unten mit dem Kamera-Knopf einzuschalten.`;

// ---- camera: the worker keeps the latest frame of the user's camera; the tool kamera_ansehen sends it to
// the web app's vision endpoint. The realtime model behind LiveKit Inference rejects image input
// ("image input is not supported on realtime sessions", e2e test 2026-11-21), so vision runs as a tool.
const CAMERA_MAX_EDGE = 1024; // px, long edge sent to the vision model

class CameraFeed {
  latest: VideoFrame | null = null;
  private stream: VideoStream | null = null;

  attach(track: RemoteTrack) {
    this.detach();
    const stream = new VideoStream(track);
    this.stream = stream;
    console.log('[mecky-voice] camera track attached');
    void (async () => {
      try {
        for await (const ev of stream) {
          if (this.stream !== stream) break;
          if (!this.latest) console.log(`[mecky-voice] first camera frame ${ev.frame.width}x${ev.frame.height}`);
          this.latest = ev.frame;
        }
      } catch {
        /* track ended */
      }
    })();
  }

  detach() {
    const s = this.stream;
    this.stream = null;
    this.latest = null;
    if (s) void s.cancel().catch(() => undefined);
  }
}

async function frameToJpegDataUrl(frame: VideoFrame): Promise<string> {
  const rgba = frame.convert(VideoBufferType.RGBA);
  const scale = Math.min(1, CAMERA_MAX_EDGE / Math.max(rgba.width, rgba.height));
  const jpeg = await sharp(Buffer.from(rgba.data.buffer, rgba.data.byteOffset, rgba.data.byteLength), {
    raw: { width: rgba.width, height: rgba.height, channels: 4 },
  })
    .resize(Math.round(rgba.width * scale), Math.round(rgba.height * scale))
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

function cameraTool(camera: CameraFeed) {
  return llm.tool({
    description:
      'Schaut durch die Handykamera der Person und beantwortet eine Frage zum aktuellen Bild (Text lesen, Gegenstände, Schilder, Speisekarten, Plakate).',
    parameters: {
      type: 'object',
      properties: { frage: { type: 'string', description: 'Was die Person über das Bild wissen will' } },
      required: ['frage'],
    },
    execute: async (args: { frage?: string }) => {
      const frame = camera.latest;
      if (!frame) return { fehler: 'Die Kamera ist aus. Bitte die Person, unten den Kamera-Knopf zu drücken.' };
      if (!VOICE_AGENT_SECRET) return { fehler: 'Sehen ist gerade nicht eingerichtet.' };
      try {
        const image = await frameToJpegDataUrl(frame);
        const res = await fetch(`${ROEBEL_API_URL}/api/voice/vision`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${VOICE_AGENT_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, question: args.frage ?? '' }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { description?: string };
        console.log('[mecky-voice] vision answered');
        return { bild: data.description ?? 'Nichts erkannt.' };
      } catch (err) {
        console.error('[mecky-voice] vision failed', err);
        return { fehler: 'Ich konnte das Bild gerade nicht auswerten.' };
      }
    },
  });
}

// Röbel knowledge from the web app (apps/web/src/app/api/voice/tools/route.ts): same read tools as the chat suite.
const ROEBEL_API_URL = process.env.ROEBEL_API_URL ?? 'https://www.roebel.app';
const VOICE_AGENT_SECRET = process.env.VOICE_AGENT_SECRET;

interface RemoteTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

async function roebelApi(init?: RequestInit): Promise<Response> {
  return fetch(`${ROEBEL_API_URL}/api/voice/tools`, {
    ...init,
    headers: { Authorization: `Bearer ${VOICE_AGENT_SECRET}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
}

/** Tools + this week's briefing. Without the secret or on failure the agent still talks, just without Röbel data. */
async function loadRoebelKnowledge(): Promise<{ tools: Record<string, ReturnType<typeof llm.tool>>; briefing: string }> {
  if (!VOICE_AGENT_SECRET) return { tools: {}, briefing: '' };
  try {
    const res = await roebelApi();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { tools: RemoteTool[]; briefing: string };
    const tools: Record<string, ReturnType<typeof llm.tool>> = {};
    for (const t of data.tools) {
      tools[t.name] = llm.tool({
        description: t.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON schema from the web app
        parameters: t.parameters as any,
        execute: async (args: unknown) => {
          const r = await roebelApi({ method: 'POST', body: JSON.stringify({ name: t.name, args }) });
          if (!r.ok) return { error: 'Das konnte ich gerade nicht nachschlagen.' };
          return ((await r.json()) as { result: unknown }).result;
        },
      });
    }
    return { tools, briefing: data.briefing ?? '' };
  } catch (err) {
    console.error('[mecky-voice] Röbel knowledge unavailable', err);
    return { tools: {}, briefing: '' };
  }
}

export default defineAgent({
  entry: async (ctx) => {
    const [, knowledge] = await Promise.all([ctx.connect(), loadRoebelKnowledge()]);
    const instructions = knowledge.briefing
      ? `${INSTRUCTIONS}\n\nRöbel-Wissen (aktuell):\n${knowledge.briefing}`
      : INSTRUCTIONS;

    const session = new AgentSession({
      // Speech-to-speech via LiveKit Inference (billed on the LiveKit Cloud project, no extra key).
      llm: new inference.RealtimeModel({ model: 'openai/gpt-realtime-2.1', voice: 'marin' }),
    });

    const camera = new CameraFeed();
    const agent = new Agent({ instructions, tools: { ...knowledge.tools, kamera_ansehen: cameraTool(camera) } });

    ctx.room
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === TrackKind.KIND_VIDEO) camera.attach(track);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === TrackKind.KIND_VIDEO) camera.detach();
      });
    // A camera that was already on before the agent joined.
    for (const p of ctx.room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind === TrackKind.KIND_VIDEO && pub.track) camera.attach(pub.track as RemoteTrack);
      }
    }

    await session.start({
      room: ctx.room,
      inputOptions: { noiseCancellation: BackgroundVoiceCancellation() },
      agent,
    });

    session.generateReply({
      instructions: 'Begrüße die Person kurz auf Deutsch als Mecky und frag, wobei du helfen kannst.',
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
    port: 8082, // 8081 belongs to Metro.
  }),
);
