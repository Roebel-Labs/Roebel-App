import {
  initialThreadState,
  isLiveTaskStatus,
  liveTaskIds,
  threadReducer,
  withTaskSnapshot,
  type TaskSnapshot,
  type ThreadState,
} from '../reducer';
import type { ChatMessage, ChatPart } from '../types';

const task = (taskId: string, status: Extract<ChatPart, { type: 'task' }>['status']): ChatPart => ({
  type: 'task',
  taskId,
  title: `Aufgabe ${taskId}`,
  status,
  steps: [{ label: 'Recherche', status: status === 'running' ? 'running' : 'pending' }],
});

const msg = (id: string, parts: ChatPart[]): ChatMessage => ({
  id,
  threadId: 't1',
  role: 'bot',
  botId: 'b1',
  parts,
  replyTo: null,
  reactions: {},
  createdAt: '2026-09-26T10:00:00.000Z',
});

const loaded = (msgs: ChatMessage[]): ThreadState =>
  threadReducer(initialThreadState, { type: 'loaded', messages: msgs, hasMore: false });

const snap = (id: string, over: Partial<TaskSnapshot> = {}): TaskSnapshot => ({
  id,
  title: `Aufgabe ${id}`,
  status: 'running',
  steps: [{ label: 'Recherche', status: 'done' }, { label: 'Entwurf', status: 'running' }],
  error: null,
  updatedAt: '2026-09-26T10:01:00.000Z',
  ...over,
});

describe('task polling reducer bits', () => {
  it('isLiveTaskStatus: queued/running/waiting are live, terminal are not', () => {
    expect(['queued', 'running', 'waiting_approval'].every((s) => isLiveTaskStatus(s as never))).toBe(true);
    expect(['done', 'failed', 'cancelled'].some((s) => isLiveTaskStatus(s as never))).toBe(false);
  });

  it('liveTaskIds: only live task parts, deduped, thread order', () => {
    const s = loaded([
      msg('m1', [{ type: 'text', text: 'Los' }, task('a', 'running')]),
      msg('m2', [task('b', 'done'), task('c', 'waiting_approval')]),
      msg('m3', [task('a', 'running')]),
    ]);
    expect(liveTaskIds(s)).toEqual(['a', 'c']);
    expect(liveTaskIds(initialThreadState)).toEqual([]);
  });

  it('task_update patches the task part in place (status + steps), other parts untouched', () => {
    const s = loaded([msg('m1', [{ type: 'text', text: 'Los' }, task('a', 'queued'), task('b', 'running')])]);
    const next = threadReducer(s, { type: 'task_update', task: snap('a') });
    const parts = next.messages[0].parts;
    expect(parts[0]).toEqual({ type: 'text', text: 'Los' });
    expect(parts[1]).toMatchObject({ type: 'task', taskId: 'a', status: 'running' });
    expect((parts[1] as Extract<ChatPart, { type: 'task' }>).steps).toHaveLength(2);
    expect(parts[2]).toBe(s.messages[0].parts[2]);
    expect(liveTaskIds(threadReducer(next, { type: 'task_update', task: snap('a', { status: 'done' }) }))).toEqual(['b']);
  });

  it('task_update with an unchanged snapshot or unknown id keeps the same state object', () => {
    const s = loaded([msg('m1', [task('a', 'running')])]);
    const once = threadReducer(s, { type: 'task_update', task: snap('a') });
    expect(threadReducer(once, { type: 'task_update', task: snap('a') })).toBe(once);
    expect(withTaskSnapshot(s, snap('zzz'))).toBe(s);
  });
});
