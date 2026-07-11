export interface PollScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

interface VisiblePollerOptions {
  intervalMs: number;
  poll(signal: AbortSignal): Promise<void>;
  scheduler: PollScheduler;
  visibility: VisibilitySource;
  onError?(error: unknown): void;
}

export interface VisiblePoller {
  refresh(): void;
  stop(): void;
}

/**
 * Polls only while visible, never overlaps requests, and measures the next
 * interval from request settlement rather than request start.
 */
export function startVisiblePoller({
  intervalMs,
  poll,
  scheduler,
  visibility,
  onError,
}: VisiblePollerOptions): VisiblePoller {
  let timer: unknown;
  let running = false;
  let refreshPending = false;
  let stopped = false;
  let activeController: AbortController | null = null;

  const clearScheduled = () => {
    if (timer === undefined) return;
    scheduler.clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    if (stopped || visibility.hidden || timer !== undefined) return;
    timer = scheduler.setTimeout(() => {
      timer = undefined;
      void run();
    }, intervalMs);
  };

  const run = async () => {
    if (stopped || visibility.hidden) return;
    if (running) {
      refreshPending = true;
      return;
    }

    running = true;
    refreshPending = false;
    const controller = new AbortController();
    activeController = controller;

    try {
      await poll(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) onError?.(error);
    } finally {
      running = false;
      if (activeController === controller) activeController = null;

      if (stopped || visibility.hidden) return;
      if (refreshPending) {
        refreshPending = false;
        void run();
      } else {
        schedule();
      }
    }
  };

  const refresh = () => {
    if (stopped) return;
    clearScheduled();

    if (visibility.hidden) {
      refreshPending = true;
      return;
    }
    if (running) {
      refreshPending = true;
      activeController?.abort();
      return;
    }
    void run();
  };

  const handleVisibilityChange = () => {
    clearScheduled();
    if (visibility.hidden) {
      refreshPending = false;
      activeController?.abort();
      return;
    }
    refresh();
  };

  visibility.addEventListener("visibilitychange", handleVisibilityChange);
  refresh();

  return {
    refresh,
    stop() {
      if (stopped) return;
      stopped = true;
      refreshPending = false;
      clearScheduled();
      activeController?.abort();
      visibility.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    },
  };
}
