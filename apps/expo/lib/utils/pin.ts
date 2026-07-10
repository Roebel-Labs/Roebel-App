// A post is "pinned" only while its pinned_until is in the future. Pins expire
// purely by time — an elapsed pinned_until is treated as unpinned everywhere
// (feed ordering, badge, drawer toggle state) without any cleanup job.
export function isPostPinned(pinnedUntil: string | null | undefined): boolean {
  if (!pinnedUntil) return false;
  const t = new Date(pinnedUntil).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/** Maps a pin_own_post RPC failure to a user-facing German snackbar message. */
export function pinErrorMessage(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? '';
  if (msg.includes('NOT_CITIZEN')) return 'Nur verifizierte Bürger:innen können Beiträge anheften';
  if (msg.includes('NOT_OWNER')) return 'Du kannst nur eigene Beiträge anheften';
  return 'Anheften nicht möglich';
}
