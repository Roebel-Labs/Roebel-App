# Mecky voice agent (LiveKit)

Backend for the Expo dev screen **Einstellungen → Entwicklermodus → Sprachassistent testen**
(`apps/expo/app/settings/dev-voice.tsx`). Based on [expo/expo-livekit-template](https://github.com/expo/expo-livekit-template).
Outside the pnpm workspace on purpose. It is deployed to LiveKit Cloud, not to Vercel.

## Flow
App → `POST /api/live/act { action: 'voice_token' }` (live session of the `testlauf` show) → token for a fresh
room `voice-<uuid>` with agent dispatch → app joins → LiveKit Cloud starts this worker in the room.

## State (2026-11-21)
Deployed: LiveKit Cloud agent `CA_ijNkNhWvi52D`, region eu-central (Frankfurt), project `robel-app-d5d21yr3`
(livekit.toml). Vercel `LIVEKIT_VOICE_AGENT_NAME=mecky-voice` is set (production + preview).
Update the agent: edit agent.ts, then run `lk agent deploy` in this folder.
The Dockerfile uses npm on purpose. LiveKit's generated one assumes pnpm because of the monorepo root.

## Setup (once, already done)
1. LiveKit CLI: `brew install livekit-cli`, then `lk project add robel-app --url … --api-key … --api-secret … --default` (values = Vercel LIVEKIT_*).
2. `cd agents/mecky-voice && npm install && lk app env -w` (writes `.env.local`, which is gitignored)
3. Local test: `npm run dev` (the worker registers as `mecky-voice`)
4. Deploy: `lk agent create` (first time), later `lk agent deploy`
5. Vercel (apps/web): set `LIVEKIT_VOICE_AGENT_NAME=mecky-voice` and redeploy. Until then the app shows
   "Der Sprachassistent ist noch nicht eingerichtet."

## Costs and data
LiveKit Inference bills per minute. Tokens last at most 10 minutes, and each wallet gets 6 per hour.
The speech model is OpenAI's model run through LiveKit Inference (US provider). Check the DPIA (DSGVO data protection impact assessment) before opening this to citizens.
