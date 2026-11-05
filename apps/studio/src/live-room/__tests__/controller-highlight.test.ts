// Chat highlight rules of the live-room controller: Unterstützungen never go on air, moderation takes a highlight off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../realtime', () => ({ subscribeShow: () => () => {} }));
vi.mock('../guests', () => ({ isJoined: () => false, joinGuest: vi.fn(), leaveGuest: vi.fn(), resyncGuestSources: () => {} }));
vi.mock('../api', async (orig) => {
  const real = await orig<typeof import('../api')>();
  return {
    ...real,
    adminCall: vi.fn(async (_t: string, _s: string, action: string, extra: Record<string, unknown>) =>
      action === 'feature_message' ? { overlay: { featured_message_id: extra.message_id ?? null } } : {},
    ),
  };
});

import { adminCall } from '../api';
import { liveRoom } from '../controller';
import { liveRoomChatHighlight } from '../seams';
import { initialState, showReducer, type Action } from '../../state/reducer';
import type { ChatMessage, LiveShow } from '../types';

const msg = (id: string, kind: ChatMessage['kind'], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  show_id: 'show-1',
  display_name: 'Anna',
  avatar_url: null,
  body: `Text ${id}`,
  kind,
  amount_cents: kind === 'support' ? 500 : null,
  created_at: `2026-11-07T18:00:0${id.length}Z`,
  hidden_at: null,
  featured_at: null,
  ...extra,
});

let state = initialState();
let unbind: () => void;
const internal = liveRoom as unknown as { set(p: object): void; onRealtimeChat(m: object, ev: string): void };

beforeEach(() => {
  vi.useFakeTimers();
  state = initialState();
  unbind = liveRoom.bind({ dispatch: (a: Action) => (state = showReducer(state, a)), getState: () => state });
  liveRoom.setToken('test-token');
  internal.set({
    show: { id: 'show-1', overlay: {} } as unknown as LiveShow,
    chat: [msg('c1', 'chat'), msg('s1', 'support')],
  });
  liveRoomChatHighlight.set(null);
  vi.mocked(adminCall).mockClear();
});
afterEach(() => {
  unbind();
  vi.useRealTimers();
});

const chatOverlayVisible = () => state.overlays.find((o) => o.id === 'ov-chat-highlight')?.visible;

describe('chat highlight', () => {
  it('a plain chat message goes on air', async () => {
    await liveRoom.featureMessage('c1');
    expect(liveRoomChatHighlight.get()).toMatchObject({ name: 'Anna', body: 'Text c1' });
    expect(chatOverlayVisible()).toBe(true);
  });

  it('a support row can never be featured: no server call, no store, no overlay', async () => {
    await expect(liveRoom.featureMessage('s1')).rejects.toThrow(/Nur Chat-Nachrichten/);
    expect(adminCall).not.toHaveBeenCalled();
    expect(liveRoomChatHighlight.get()).toBeNull();
    expect(chatOverlayVisible()).toBe(false);
  });

  it('hidden elsewhere (Realtime UPDATE hidden_at) takes the highlight off air', async () => {
    await liveRoom.featureMessage('c1');
    internal.onRealtimeChat({ id: 'c1', hidden_at: '2026-11-07T18:01:00Z' }, 'UPDATE');
    expect(chatOverlayVisible()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(liveRoomChatHighlight.get()).toBeNull();
  });

  it('deleted elsewhere (Realtime DELETE) takes the highlight off air', async () => {
    await liveRoom.featureMessage('c1');
    internal.onRealtimeChat({ id: 'c1' }, 'DELETE');
    expect(chatOverlayVisible()).toBe(false);
  });

  it('featured_message_id cleared on the server takes it off air; unrelated show updates do not', async () => {
    await liveRoom.featureMessage('c1');
    liveRoom.onRealtimeShow({ id: 'show-1', chat_enabled: false });
    expect(chatOverlayVisible()).toBe(true);
    liveRoom.onRealtimeShow({ id: 'show-1', overlay: { featured_message_id: 'c1' } });
    expect(chatOverlayVisible()).toBe(true);
    liveRoom.onRealtimeShow({ id: 'show-1', overlay: {} });
    expect(chatOverlayVisible()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(liveRoomChatHighlight.get()).toBeNull();
  });
});

describe('guest tile removal', () => {
  it('ends the guest through the live room (LiveKit + server) instead of only dropping the source', async () => {
    const { leaveGuest } = await import('../guests');
    internal.set({ guests: [{ id: 'r1', display_name: 'Gast', avatar_url: null, note: null, status: 'accepted', room: 'x', created_at: '' }] });
    expect(await liveRoom.endGuestBySource('liveroom-guest-r1')).toBe(true);
    expect(leaveGuest).toHaveBeenCalledWith('r1');
    expect(adminCall).toHaveBeenCalledWith('test-token', 'show-1', 'guest_end', { request_id: 'r1' });
    expect(await liveRoom.endGuestBySource('cam-1')).toBe(false);
  });
});
