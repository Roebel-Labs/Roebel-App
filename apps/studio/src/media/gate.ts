// Capture gate: cameras and microphones open ONLY while the operator is in the Livestream section or a
// broadcast/recording runs. Opening Ortis Studio for the workspace must never light the camera
// (Max, 2026-11-12: "creepy"). Off → camera sources and device audio channels are withheld from the
// engine, which releases them (camera light off); video files, images, colours and network ingest stay.
import type { AudioChannel, ShowState } from '../state/types';

export function captureAllowed(section: string, phase: 'off' | string): boolean {
  return section === 'live' || phase !== 'off';
}

export function gateSources(sources: ShowState['sources'], allowed: boolean): ShowState['sources'] {
  return allowed ? sources : sources.filter((s) => s.kind !== 'camera');
}

export function gateAudio(audio: ShowState['audio'], allowed: boolean): ShowState['audio'] {
  return allowed ? audio : { ...audio, channels: audio.channels.filter((c: AudioChannel) => c.input.kind !== 'device') };
}

// Tiny external store: the shell writes the section, the engine reads the gate.
let section = 'home';
const listeners = new Set<() => void>();

export function setCaptureSection(next: string): void {
  if (next === section) return;
  section = next;
  for (const l of listeners) l();
}

export function captureSection(): string {
  return section;
}

export function subscribeCaptureSection(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
