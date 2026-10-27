import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Unfinished event submissions, kept on-device per account. Drafts never touch
 * the `events` table: its status CHECK only knows pending/approved/rejected and
 * several public queries don't filter by status, so a DB draft could leak.
 */
export type EventDraft = {
  id: string;
  updatedAt: string;
  form: Record<string, string>;
  isRecurring: boolean;
  selectedDates: string[];
  /** Local image URI picked in the form (uploaded only on submit). */
  uploadedImage: string | null;
};

const key = (accountId: string) => `event-drafts:v1:${accountId}`;

export async function listEventDrafts(accountId: string): Promise<EventDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(key(accountId));
    const drafts = raw ? (JSON.parse(raw) as EventDraft[]) : [];
    return Array.isArray(drafts)
      ? drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [];
  } catch {
    return [];
  }
}

export async function getEventDraft(accountId: string, draftId: string): Promise<EventDraft | null> {
  const drafts = await listEventDrafts(accountId);
  return drafts.find((d) => d.id === draftId) ?? null;
}

/** Insert or replace a draft (matched by id). */
export async function saveEventDraft(accountId: string, draft: EventDraft): Promise<void> {
  const drafts = await listEventDrafts(accountId);
  const next = [draft, ...drafts.filter((d) => d.id !== draft.id)];
  await AsyncStorage.setItem(key(accountId), JSON.stringify(next));
}

export async function deleteEventDraft(accountId: string, draftId: string): Promise<void> {
  const drafts = await listEventDrafts(accountId);
  await AsyncStorage.setItem(key(accountId), JSON.stringify(drafts.filter((d) => d.id !== draftId)));
}

export function newEventDraftId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
