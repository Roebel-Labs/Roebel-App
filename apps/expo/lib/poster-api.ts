// Client for the web app's poster proposal API (apps/web/src/app/api/posters/*).
//
// Right before an event is submitted in the AI chat, the web server designs two
// DIN-A posters for it (OpenAI image model, AI-Act marked, stored in our bucket)
// and the person picks one. The Expo app never holds an image-model key; it only
// sends the draft and receives public image URLs.
//
// Auth matches the routes: `x-wallet-address` + an account the wallet owns.
// Every call costs money server-side, so the server enforces a daily budget, two
// rounds per draft and ten per account per day.
import { getApiBaseUrl } from './signed-request';

export type PosterMode = 'reformat' | 'design';

export interface PosterOption {
  id: string;
  variant: 1 | 2;
  direction: string;
  image_url: string;
}

export type ProposeOutcome =
  | { kind: 'proposals'; batchId: string; mode: PosterMode; proposals: PosterOption[] }
  | { kind: 'skipped'; reason: string }
  | { kind: 'error'; code: PosterErrorCode; message: string };

export type PosterErrorCode = 'unauthorized' | 'limit' | 'unavailable' | 'timeout' | 'network' | 'bad_response';

/** What the server's draft schema accepts (apps/web/src/app/api/posters/propose/route.ts). */
export interface PosterDraft {
  title: string;
  date?: string;
  time?: string;
  end_time?: string;
  location?: string;
  category?: string;
  ticket_price?: number | string;
  organizer_name?: string;
  description?: string;
  website_url?: string;
  image_url?: string;
}

export interface PosterCaller {
  accountId: string;
  wallet: string;
}

/** Rendering two posters takes 45–90 s; the route itself may run up to 300 s. */
const PROPOSE_TIMEOUT_MS = 170_000;
const SHORT_TIMEOUT_MS = 20_000;

export const DIRECTION_LABELS: Record<string, string> = {
  plakativ: 'Plakativ',
  originaltreu: 'Originaltreu',
  aufgefrischt: 'Aufgefrischt',
  editorial: 'Editorial',
  konzert: 'Konzertplakat',
  verspielt: 'Verspielt',
  ruhig: 'Ruhig',
  amtlich: 'Amtlich',
  appetitlich: 'Appetitlich',
  galerie: 'Galerie',
  festlich: 'Festlich',
};

export function directionLabel(direction: string): string {
  return DIRECTION_LABELS[direction] ?? direction;
}

export function variantLetter(variant: number): string {
  return variant === 2 ? 'B' : 'A';
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.replace(/\s+/g, ' ').trim();
  return v.length > 0 ? v : undefined;
}

/**
 * Map the chat's recap data (the prepare_event_submission tool input) onto the
 * server's draft schema. Returns null when there is no title — the server
 * cannot design a poster without one.
 */
export function buildPosterDraft(recap: Record<string, unknown> | null | undefined): PosterDraft | null {
  if (!recap) return null;
  const title = cleanString(recap.title);
  if (!title) return null;

  const dates = Array.isArray(recap.dates) ? recap.dates : [];
  const date = cleanString(recap.date) ?? cleanString(dates[0]);

  let ticket_price: number | string | undefined;
  if (typeof recap.ticket_price === 'number' && Number.isFinite(recap.ticket_price)) {
    ticket_price = recap.ticket_price;
  } else if (typeof recap.ticket_price === 'string' && recap.ticket_price.trim() !== '') {
    ticket_price = recap.ticket_price.trim();
  }

  const image = cleanString(recap.image_url);

  const draft: PosterDraft = { title };
  const optional: Array<[keyof PosterDraft, string | undefined]> = [
    ['date', date],
    ['time', cleanString(recap.time)],
    ['end_time', cleanString(recap.end_time)],
    ['location', cleanString(recap.location)],
    ['category', cleanString(recap.category)],
    ['organizer_name', cleanString(recap.organizer_name)],
    ['description', typeof recap.description === 'string' ? recap.description.trim() || undefined : undefined],
    ['website_url', cleanString(recap.website_url)],
    ['image_url', image && /^https:\/\//i.test(image) ? image : undefined],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) (draft as unknown as Record<string, unknown>)[key] = value;
  }
  if (ticket_price !== undefined) draft.ticket_price = ticket_price;
  return draft;
}

function isPosterOption(value: unknown): value is PosterOption {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.variant === 1 || v.variant === 2) &&
    typeof v.direction === 'string' &&
    typeof v.image_url === 'string' &&
    v.image_url.startsWith('https://')
  );
}

/** Turn the route's HTTP status + JSON into one outcome the chat can render. */
export function parseProposeResponse(status: number, json: unknown): ProposeOutcome {
  const body = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const serverMessage = typeof body.error === 'string' ? body.error : null;

  if (status >= 200 && status < 300 && body.success === true) {
    if (typeof body.skipped === 'string') return { kind: 'skipped', reason: body.skipped };
    const proposals = (Array.isArray(body.proposals) ? body.proposals : [])
      .filter(isPosterOption)
      .sort((a, b) => a.variant - b.variant);
    if (proposals.length > 0 && typeof body.batchId === 'string') {
      const mode: PosterMode = body.mode === 'reformat' ? 'reformat' : 'design';
      return { kind: 'proposals', batchId: body.batchId, mode, proposals };
    }
    return { kind: 'error', code: 'bad_response', message: 'Unerwartete Antwort vom Server.' };
  }
  if (status === 401 || status === 403) {
    return { kind: 'error', code: 'unauthorized', message: serverMessage ?? 'Nicht berechtigt.' };
  }
  if (status === 429) {
    return { kind: 'error', code: 'limit', message: serverMessage ?? 'Limit für Plakat-Vorschläge erreicht.' };
  }
  return {
    kind: 'error',
    code: 'unavailable',
    message: serverMessage ?? 'Plakat-Vorschläge sind gerade nicht verfügbar.',
  };
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  wallet: string,
  timeoutMs: number,
): Promise<{ status: number; json: unknown }> {
  // React Native fetch has no timeout of its own; without this a dead request
  // would leave the poster step spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wallet-address': wallet.toLowerCase() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the server for two posters for a not-yet-submitted event. Never throws. */
export async function proposePostersForDraft(
  draftId: string,
  draft: PosterDraft,
  caller: PosterCaller,
  hint?: string,
): Promise<ProposeOutcome> {
  try {
    const { status, json } = await postJson(
      '/api/posters/propose',
      { draftId, draft, accountId: caller.accountId, wallet: caller.wallet, ...(hint ? { hint } : {}) },
      caller.wallet,
      PROPOSE_TIMEOUT_MS,
    );
    return parseProposeResponse(status, json);
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return aborted
      ? { kind: 'error', code: 'timeout', message: 'Das Gestalten hat zu lange gedauert.' }
      : { kind: 'error', code: 'network', message: 'Keine Verbindung zum Server.' };
  }
}

/** Record the chosen variant (the event does not exist yet, so nothing is applied). */
export async function selectPoster(proposalId: string, caller: PosterCaller): Promise<boolean> {
  try {
    const { status } = await postJson(
      '/api/posters/select',
      { proposalId, apply: false, accountId: caller.accountId, wallet: caller.wallet },
      caller.wallet,
      SHORT_TIMEOUT_MS,
    );
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
}

/** After the event row exists, attach the draft's proposals to it. */
export async function linkPosterDraft(draftId: string, eventId: string, caller: PosterCaller): Promise<boolean> {
  try {
    const { status } = await postJson(
      '/api/posters/link',
      { draftId, eventId, accountId: caller.accountId, wallet: caller.wallet },
      caller.wallet,
      SHORT_TIMEOUT_MS,
    );
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
}
