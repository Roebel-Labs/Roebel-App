// A post is "pinned" only while its pinned_until is in the future. Pins expire
// purely by time — an elapsed pinned_until is treated as unpinned everywhere
// (feed ordering, badge, drawer toggle state) without any cleanup job.
export function isPostPinned(pinnedUntil: string | null | undefined): boolean {
  if (!pinnedUntil) return false;
  const t = new Date(pinnedUntil).getTime();
  return !Number.isNaN(t) && t > Date.now();
}
