// Mecky voice agent for the Röbel app (LiveKit Agents, Node).
// Dispatched by name: the app's token (POST /api/live/act { action: 'voice_token' }) carries
// roomConfig.agents = [{ agentName: LIVEKIT_VOICE_AGENT_NAME }] → must equal AGENT_NAME below.
import { Agent, AgentSession, ServerOptions, cli, defineAgent, inference } from '@livekit/agents';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';

const AGENT_NAME = 'mecky-voice';

const INSTRUCTIONS = `Du bist Mecky, der freundliche Assistent der Röbel-App für Röbel/Müritz.
Du sprichst mit Bürgerinnen und Bürgern per Sprache. Antworte immer auf Deutsch (außer jemand spricht
eine andere Sprache), kurz, warm und natürlich – zwei bis drei Sätze, keine Aufzählungen, kein Markdown.
Du duzt. Wenn du etwas nicht sicher weißt (Öffnungszeiten, Termine, Personen), sag das ehrlich und
erfinde nichts. Nenne niemals Wallet-Adressen. Die Röbel Münzen heißen immer "Röbel Münzen", nie "Währung".
Du bist eine KI – sag das, wenn jemand fragt.`;

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    const session = new AgentSession({
      // Speech-to-speech via LiveKit Inference (billed on the LiveKit Cloud project, no extra key).
      llm: new inference.RealtimeModel({ model: 'openai/gpt-realtime-2.1', voice: 'marin' }),
    });

    await session.start({
      room: ctx.room,
      inputOptions: { noiseCancellation: BackgroundVoiceCancellation() },
      agent: new Agent({ instructions: INSTRUCTIONS }),
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
