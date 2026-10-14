/** Runs async tasks strictly one after another, in call order. A rejecting task never blocks the queue. */
export function createSerialRunner() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}
