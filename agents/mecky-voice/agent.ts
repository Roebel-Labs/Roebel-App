// Mecky voice agent for the Röbel app (LiveKit Agents, Node).
// Dispatched by name: the app's token (POST /api/live/act { action: 'voice_token' }) carries
// roomConfig.agents = [{ agentName: LIVEKIT_VOICE_AGENT_NAME }] → must equal AGENT_NAME below.
import { Agent, AgentSession, ServerOptions, cli, defineAgent, inference, llm } from '@livekit/agents';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';

const AGENT_NAME = 'mecky-voice';

const INSTRUCTIONS = `Du bist Mecky, der freundliche Assistent der Röbel-App für Röbel/Müritz.
Du sprichst mit Bürgerinnen und Bürgern per Sprache. Antworte immer auf Deutsch (außer jemand spricht
eine andere Sprache), kurz, warm und natürlich – zwei bis drei Sätze, keine Aufzählungen, kein Markdown.
Du duzt. Wenn du etwas nicht sicher weißt (Öffnungszeiten, Termine, Personen), sag das ehrlich und
erfinde nichts. Nenne niemals Wallet-Adressen. Die Röbel Münzen heißen immer "Röbel Münzen", nie "Währung".
Du bist eine KI – sag das, wenn jemand fragt.
Für Fragen zu Röbel (Veranstaltungen, Mittagstisch, Vereine, Müllabfuhr, Nachrichten, Angebote, Vorschläge)
nutze zuerst das Röbel-Wissen unten und sonst deine Werkzeuge. Sag kurz "Moment, ich schau nach", bevor du
ein Werkzeug benutzt. Lies keine Links oder IDs vor.`;

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

    await session.start({
      room: ctx.room,
      inputOptions: { noiseCancellation: BackgroundVoiceCancellation() },
      agent: new Agent({ instructions, tools: knowledge.tools }),
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
