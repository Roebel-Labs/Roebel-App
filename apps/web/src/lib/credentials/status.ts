// The public switch state behind GET /api/credentials/status. Missing key, read error or anything
// but 'true' = off: closed is the safe direction.
// Relative imports only: loaded by `npx tsx --test`.

export type CredentialStatus = { enabled: boolean; configured: boolean; designer: boolean };

export async function credentialStatus(read: (key: string) => Promise<string | null>, configured: boolean): Promise<CredentialStatus> {
  const on = async (key: string) => {
    try {
      const v = await read(key);
      return typeof v === "string" && v.trim() === "true";
    } catch {
      return false;
    }
  };
  const [enabled, designer] = await Promise.all([on("credentials_enabled"), on("credential_designer_enabled")]);
  return { enabled, configured, designer };
}
