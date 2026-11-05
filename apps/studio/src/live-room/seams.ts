// The live room's contact points with the studio core. Everything the core needs to READ lives here as a
// tiny store (no React, no network imports), and everything the live room needs the core to DO is an
// optional adapter the owner plugs in with `configureLiveRoomSeams({...})`. Unset adapters fall back to
// copy buttons / manual controls in the panel.

export type Listener = () => void;

export class Store<T> {
  private listeners = new Set<Listener>();
  constructor(private value: T) {}
  get = (): T => this.value;
  set(v: T): void {
    if (Object.is(v, this.value)) return;
    this.value = v;
    for (const l of [...this.listeners]) l();
  }
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

// ---------------------------------------------------------------- read by the core

/** For RenderContext.donation (program.ts defaultRenderContext): `donation: liveRoomDonation.get()`. */
export type DonationContext = { name: string; amount: string; message: string };
export const liveRoomDonation = new Store<DonationContext | null>(null);

/** For a future RenderContext.chatHighlight + "chatHighlight" template. */
export type ChatHighlightContext = { name: string; body: string; avatarUrl: string };
export const liveRoomChatHighlight = new Store<ChatHighlightContext | null>(null);

/** Phone guests connected over LiveKit. `stream` carries the guest's camera + mic tracks. */
export type LiveGuest = { requestId: string; label: string; stream: MediaStream; state: 'connecting' | 'waiting' | 'live' | 'lost' };

class GuestRegistry {
  private map = new Map<string, LiveGuest>();
  private listeners = new Set<Listener>();
  private snapshot: LiveGuest[] = [];
  getStream(requestId: string): MediaStream | null {
    return this.map.get(requestId)?.stream ?? null;
  }
  get(requestId: string): LiveGuest | undefined {
    return this.map.get(requestId);
  }
  list = (): LiveGuest[] => this.snapshot;
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  /** @internal live-room only */
  put(g: LiveGuest): void {
    this.map.set(g.requestId, g);
    this.emit();
  }
  /** @internal live-room only */
  remove(requestId: string): void {
    if (this.map.delete(requestId)) this.emit();
  }
  private emit() {
    this.snapshot = [...this.map.values()];
    for (const l of [...this.listeners]) l();
  }
}
export const liveRoomGuests = new GuestRegistry();

// ---------------------------------------------------------------- provided by the core

export interface OnAirSource {
  /** True while the studio's broadcast is running (encoder started). */
  get(): boolean;
  subscribe(cb: () => void): () => void;
}

/** Same shape as Task 11's destination entry is expected to accept; the owner maps it if it differs. */
export type { LiveRoomDestination } from './destinations';
import type { LiveRoomDestination } from './destinations';

export type LiveRoomSeams = {
  onAir?: OnAirSource;
  addDestination?: (dest: LiveRoomDestination) => void;
  registerExternalSource?: (id: string, label: string, stream: MediaStream) => void;
  unregisterExternalSource?: (id: string) => void;
};

export const liveRoomSeams = new Store<LiveRoomSeams>({});

export function configureLiveRoomSeams(patch: LiveRoomSeams): void {
  liveRoomSeams.set({ ...liveRoomSeams.get(), ...patch });
}

/** Studio source id used for a guest (stable per request). */
export const guestSourceId = (requestId: string) => `liveroom-guest-${requestId}`;
