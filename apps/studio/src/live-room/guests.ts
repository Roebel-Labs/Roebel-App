// Phone guests over LiveKit: one Room per accepted request. The guest's camera + mic land in one
// MediaStream that is published through `liveRoomGuests` and, when the core provides the seam, registered
// as a studio source (`registerExternalSource`).

import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { guestSourceId, liveRoomGuests, liveRoomSeams, type LiveGuest } from './seams';
import type { GuestJoin } from './types';

type Session = {
  requestId: string;
  label: string;
  room: Room;
  stream: MediaStream;
  /** Chromium only feeds remote WebRTC audio into WebAudio while some media element plays it (muted is fine). */
  sink: HTMLAudioElement;
  registered: boolean;
  closing: boolean;
};

const sessions = new Map<string, Session>();

function publish(s: Session, state: LiveGuest['state']) {
  liveRoomGuests.put({ requestId: s.requestId, label: s.label, stream: s.stream, state });
}

function hasVideo(stream: MediaStream) {
  return stream.getVideoTracks().some((t) => t.readyState === 'live');
}

/** (Re-)registers the guest as a studio source; a changed track set needs a fresh registration. */
function syncSource(s: Session) {
  const seams = liveRoomSeams.get();
  const id = guestSourceId(s.requestId);
  if (s.registered) {
    seams.unregisterExternalSource?.(id);
    s.registered = false;
  }
  if (!s.closing && hasVideo(s.stream) && seams.registerExternalSource) {
    seams.registerExternalSource(id, s.label, s.stream);
    s.registered = true;
  }
}

function replaceTrack(s: Session, track: MediaStreamTrack) {
  for (const t of s.stream.getTracks()) if (t.kind === track.kind) s.stream.removeTrack(t);
  s.stream.addTrack(track);
}

function remoteCount(room: Room) {
  return room.remoteParticipants.size;
}

export async function joinGuest(join: GuestJoin, label: string): Promise<void> {
  await leaveGuest(join.request_id);
  const room = new Room({ adaptiveStream: false, dynacast: false });
  const sink = document.createElement('audio');
  sink.muted = true;
  sink.autoplay = true;
  const s: Session = { requestId: join.request_id, label, room, stream: new MediaStream(), sink, registered: false, closing: false };
  sink.srcObject = s.stream;
  sessions.set(join.request_id, s);
  publish(s, 'connecting');

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
      replaceTrack(s, track.mediaStreamTrack);
      void sink.play().catch(() => {});
      syncSource(s);
      publish(s, hasVideo(s.stream) ? 'live' : 'waiting');
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (s.stream.getTracks().includes(track.mediaStreamTrack)) s.stream.removeTrack(track.mediaStreamTrack);
      syncSource(s);
      publish(s, hasVideo(s.stream) ? 'live' : 'waiting');
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      if (remoteCount(room) === 0) {
        for (const t of s.stream.getTracks()) s.stream.removeTrack(t);
        syncSource(s);
        publish(s, 'waiting');
      }
    })
    .on(RoomEvent.Reconnecting, () => publish(s, 'connecting'))
    .on(RoomEvent.Reconnected, () => publish(s, hasVideo(s.stream) ? 'live' : 'waiting'))
    .on(RoomEvent.Disconnected, () => {
      if (s.closing) return;
      // Drop the studio source (its tracks are dead), keep the tile so the operator can re-join.
      if (s.registered) liveRoomSeams.get().unregisterExternalSource?.(guestSourceId(s.requestId));
      s.registered = false;
      for (const t of s.stream.getTracks()) s.stream.removeTrack(t);
      publish(s, 'lost');
    });

  try {
    await room.connect(join.livekit_url, join.token, { autoSubscribe: true });
    publish(s, hasVideo(s.stream) ? 'live' : 'waiting');
  } catch (e) {
    publish(s, 'lost');
    throw e;
  }
}

export async function leaveGuest(requestId: string): Promise<void> {
  const s = sessions.get(requestId);
  if (!s) {
    liveRoomGuests.remove(requestId);
    return;
  }
  s.closing = true;
  sessions.delete(requestId);
  syncSource(s);
  try {
    await s.room.disconnect();
  } catch {
    // already gone
  }
  s.sink.srcObject = null;
  liveRoomGuests.remove(requestId);
}

export function isJoined(requestId: string): boolean {
  return sessions.has(requestId);
}

/** Re-runs source registration (e.g. after the core plugged in `registerExternalSource`). */
export function resyncGuestSources(): void {
  for (const s of sessions.values()) syncSource(s);
}

export async function leaveAllGuests(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => leaveGuest(id)));
}
