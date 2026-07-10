import assert from "node:assert/strict";
import { test } from "node:test";

import {
  startVisiblePoller,
  type PollScheduler,
  type VisibilitySource,
} from "../src/lib/visible-poller";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class FakeScheduler implements PollScheduler {
  readonly tasks = new Map<number, () => void>();
  private nextId = 1;

  setTimeout(callback: () => void) {
    const id = this.nextId++;
    this.tasks.set(id, callback);
    return id;
  }

  clearTimeout(handle: unknown) {
    this.tasks.delete(handle as number);
  }

  runNext() {
    const next = this.tasks.entries().next().value as
      | [number, () => void]
      | undefined;
    assert.ok(next, "expected a scheduled poll");
    const [id, callback] = next;
    this.tasks.delete(id);
    callback();
  }
}

class FakeVisibility implements VisibilitySource {
  private readonly listeners = new Set<() => void>();

  constructor(public hidden: boolean) {}

  addEventListener(_type: "visibilitychange", listener: () => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "visibilitychange", listener: () => void) {
    this.listeners.delete(listener);
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    for (const listener of this.listeners) listener();
  }
}

test("coalesces refreshes and schedules the next poll after settlement", async () => {
  const scheduler = new FakeScheduler();
  const visibility = new FakeVisibility(false);
  const runs: Array<{
    signal: AbortSignal;
    pending: ReturnType<typeof deferred>;
  }> = [];
  const publications: number[] = [];

  const poller = startVisiblePoller({
    intervalMs: 60_000,
    scheduler,
    visibility,
    poll: async (signal) => {
      const pending = deferred();
      runs.push({ signal, pending });
      const runNumber = runs.length;
      await pending.promise;
      if (!signal.aborted) publications.push(runNumber);
    },
  });

  assert.equal(runs.length, 1);
  assert.equal(scheduler.tasks.size, 0);

  poller.refresh();
  poller.refresh();
  assert.equal(runs.length, 1, "manual refreshes must not overlap");
  assert.equal(runs[0].signal.aborted, true, "refresh invalidates stale work");

  runs[0].pending.resolve();
  await flushMicrotasks();
  assert.deepEqual(publications, [], "an invalidated result must not publish");
  assert.equal(runs.length, 2, "queued refreshes collapse into one follow-up");
  assert.equal(scheduler.tasks.size, 0);

  runs[1].pending.resolve();
  await flushMicrotasks();
  assert.deepEqual(publications, [2]);
  assert.equal(
    scheduler.tasks.size,
    1,
    "interval starts after the request settles"
  );

  scheduler.runNext();
  assert.equal(runs.length, 3);
  assert.equal(scheduler.tasks.size, 0);

  poller.stop();
  assert.equal(runs[2].signal.aborted, true);
});

test("does not poll while hidden and resumes once when visible", async () => {
  const scheduler = new FakeScheduler();
  const visibility = new FakeVisibility(true);
  const runs: Array<ReturnType<typeof deferred>> = [];

  const poller = startVisiblePoller({
    intervalMs: 60_000,
    scheduler,
    visibility,
    poll: async () => {
      const pending = deferred();
      runs.push(pending);
      await pending.promise;
    },
  });

  assert.equal(runs.length, 0);
  assert.equal(scheduler.tasks.size, 0);

  visibility.setHidden(false);
  assert.equal(runs.length, 1);

  runs[0].resolve();
  await flushMicrotasks();
  assert.equal(scheduler.tasks.size, 1);

  visibility.setHidden(true);
  assert.equal(scheduler.tasks.size, 0, "hiding cancels scheduled work");

  visibility.setHidden(false);
  assert.equal(runs.length, 2);
  poller.stop();
});

test("stopping an in-flight poll aborts it and prevents later scheduling", async () => {
  const scheduler = new FakeScheduler();
  const visibility = new FakeVisibility(false);
  const pending = deferred();
  let signal: AbortSignal | undefined;
  let calls = 0;

  const poller = startVisiblePoller({
    intervalMs: 60_000,
    scheduler,
    visibility,
    poll: async (nextSignal) => {
      calls += 1;
      signal = nextSignal;
      await pending.promise;
    },
  });

  assert.equal(calls, 1);
  poller.stop();
  assert.equal(signal?.aborted, true);

  pending.resolve();
  await flushMicrotasks();
  assert.equal(scheduler.tasks.size, 0);

  poller.refresh();
  assert.equal(calls, 1);
});
