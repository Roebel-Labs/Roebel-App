// apps/web/src/lib/event-radio/voices.ts
// Lists the account's own ElevenLabs voices so the admin panel can offer them
// as candidates. Premade voices are filtered out: the Wochen-Radio host is
// always a voice this account created (Voice Design or a clone).
// Docs: https://elevenlabs.io/docs/api-reference/voices/search

export type RadioVoice = { id: string; name: string; previewUrl: string | null };

type VoiceRaw = {
  voice_id?: string;
  name?: string;
  category?: string;
  preview_url?: string | null;
};

export async function listOwnVoices(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RadioVoice[]> {
  const res = await fetchImpl("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { voices?: VoiceRaw[] };
  return (json.voices ?? [])
    .filter((v) => v.voice_id && v.category !== "premade")
    .map((v) => ({
      id: v.voice_id as string,
      name: v.name?.trim() || (v.voice_id as string),
      previewUrl: v.preview_url ?? null,
    }));
}
