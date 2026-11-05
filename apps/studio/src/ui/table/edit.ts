/** What a cell/header blur should commit: nothing when the edit was cancelled or unchanged. */
export function commitValue(draft: string, original: string, cancelled: boolean): string | null {
  return cancelled || draft === original ? null : draft;
}
