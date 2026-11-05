// Drift-free output clock. Each tick is scheduled against an absolute timeline
// (start + n * frameMs, performance.now()) with a one-shot setTimeout for the
// remaining delay. Ticks that were missed (main-thread stall) are skipped,
// never burst-fired, and counted as overruns.
//
// Not rAF-based on purpose: rAF stops when the window is hidden/minimised;
// timers keep running because the BrowserWindow has backgroundThrottling: false.

export type ClockStats = { fps: number; overruns: number; ticks: number };

export class OutputClock {
  private readonly frameMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private t0 = 0;
  private n = 0;
  private overruns = 0;
  private ticks = 0;
  // fps measurement window (constant memory)
  private winStart = 0;
  private winTicks = 0;
  private measuredFps = 0;

  constructor(
    private readonly fps: number,
    private readonly tick: (nowMs: number) => void,
  ) {
    if (!(fps > 0)) throw new Error(`invalid fps ${fps}`);
    this.frameMs = 1000 / fps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    this.n = 0;
    this.winStart = this.t0;
    this.winTicks = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  stats(): ClockStats {
    return { fps: this.measuredFps, overruns: this.overruns, ticks: this.ticks };
  }

  private schedule() {
    const due = this.t0 + this.n * this.frameMs;
    const delay = Math.max(0, due - performance.now());
    this.timer = setTimeout(this.run, delay);
  }

  private run = () => {
    this.timer = null;
    if (!this.running) return;
    const now = performance.now();
    const due = this.t0 + this.n * this.frameMs;
    const lateAtFire = now - due;
    try {
      this.tick(now);
    } catch (e) {
      console.error('[output-clock] tick failed', e);
    }
    if (!this.running) return; // stop() called from inside the tick
    this.ticks++;
    this.winTicks++;
    const after = performance.now();
    if (after - this.winStart >= 1000) {
      this.measuredFps = (this.winTicks * 1000) / (after - this.winStart);
      this.winStart = after;
      this.winTicks = 0;
    }
    // Next slot strictly in the future; anything in between is skipped.
    const next = Math.max(this.n + 1, Math.floor((after - this.t0) / this.frameMs) + 1);
    if (lateAtFire > this.frameMs || next > this.n + 1) this.overruns++;
    this.n = next;
    this.schedule();
  };
}
