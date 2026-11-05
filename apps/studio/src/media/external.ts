// Runtime MediaStreams behind 'external' sources (Live-Raum phone guests). Deliberately NOT part of the
// ShowState: streams cannot be serialized, are never autosaved and never reach the OBS overlay page.
// The owner of a stream (the Live-Raum's LiveKit session) keeps owning its tracks: nothing here stops them.

type Listener = (id: string) => void;

class ExternalMedia {
  private streams = new Map<string, MediaStream>();
  private listeners = new Set<Listener>();

  get(id: string): MediaStream | null {
    return this.streams.get(id) ?? null;
  }

  /** (Re-)sets the stream of a source; also emits for the same stream, whose track set may have changed. */
  set(id: string, stream: MediaStream): void {
    this.streams.set(id, stream);
    this.emit(id);
  }

  delete(id: string): void {
    if (this.streams.delete(id)) this.emit(id);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(id: string) {
    for (const l of [...this.listeners]) {
      try {
        l(id);
      } catch (err) {
        console.error('[external] listener failed', err);
      }
    }
  }
}

export const externalMedia = new ExternalMedia();
