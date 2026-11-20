/**
 * Entry shimmer timing: skeleton on mount and on every focus, gone after the
 * beat, never re-armed by plain re-renders; reduced motion gets a shorter beat.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// Focus simulation: useFocusEffect runs its callback on mount and whenever
// the test calls `refocus()` (blur cleanup first, like the navigator).
const mockFocusListeners = new Set<() => void>();
jest.mock('expo-router', () => {
  const R = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      R.useEffect(() => {
        let cleanup = cb();
        const onFocus = () => {
          if (typeof cleanup === 'function') cleanup();
          cleanup = cb();
        };
        mockFocusListeners.add(onFocus);
        return () => {
          mockFocusListeners.delete(onFocus);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [cb]);
    },
  };
});

import { AccessibilityInfo } from 'react-native';

let mockReduceMotion = false;
jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(mockReduceMotion));
jest
  .spyOn(AccessibilityInfo, 'addEventListener')
  .mockImplementation((() => ({ remove: () => undefined })) as unknown as typeof AccessibilityInfo.addEventListener);

import {
  ENTRY_SHIMMER_MS,
  ENTRY_SHIMMER_REDUCED_MS,
  entryShimmerDuration,
  useEntryShimmer,
  type EntryShimmer,
} from '../useEntryShimmer';

function refocus() {
  mockFocusListeners.forEach((l) => l());
}

let latest: EntryShimmer | null = null;
let renderer: TestRenderer.ReactTestRenderer | null = null;
function Harness({ tick }: { tick: number }) {
  latest = useEntryShimmer();
  return <>{String(tick)}</>;
}

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(<Harness tick={0} />);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockReduceMotion = false;
  mockFocusListeners.clear();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  jest.useRealTimers();
});

describe('entryShimmerDuration', () => {
  it('uses the base beat normally and a shorter one with reduced motion', () => {
    expect(entryShimmerDuration(false)).toBe(ENTRY_SHIMMER_MS);
    expect(entryShimmerDuration(true)).toBe(ENTRY_SHIMMER_REDUCED_MS);
    expect(entryShimmerDuration(true, 100)).toBe(100);
    expect(entryShimmerDuration(false, 0)).toBe(0);
  });
});

describe('useEntryShimmer', () => {
  it('shows the skeleton from the first frame and hides it after the beat', async () => {
    await mount();
    expect(latest?.visible).toBe(true);
    act(() => jest.advanceTimersByTime(ENTRY_SHIMMER_MS - 1));
    expect(latest?.visible).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(latest?.visible).toBe(false);
  });

  it('does not re-arm on plain re-renders', async () => {
    await mount();
    act(() => jest.advanceTimersByTime(ENTRY_SHIMMER_MS));
    act(() => renderer!.update(<Harness tick={1} />));
    act(() => renderer!.update(<Harness tick={2} />));
    expect(latest?.visible).toBe(false);
  });

  it('re-arms on every focus', async () => {
    await mount();
    act(() => jest.advanceTimersByTime(ENTRY_SHIMMER_MS));
    expect(latest?.visible).toBe(false);
    act(() => refocus());
    expect(latest?.visible).toBe(true);
    act(() => jest.advanceTimersByTime(ENTRY_SHIMMER_MS));
    expect(latest?.visible).toBe(false);
  });

  it('uses the shorter beat with reduced motion on', async () => {
    mockReduceMotion = true;
    await mount();
    // the reduce-motion flag arrives async; a fresh focus picks it up
    act(() => refocus());
    act(() => jest.advanceTimersByTime(ENTRY_SHIMMER_REDUCED_MS));
    expect(latest?.visible).toBe(false);
    expect(latest?.reduceMotion).toBe(true);
  });
});
