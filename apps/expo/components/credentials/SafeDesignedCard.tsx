/**
 * DesignedCard behind every guard a card on the profile needs: Skia is only required when this
 * binary has it (an older 3.10.0 binary gets the OTA without Skia), the require itself and any
 * render error fall back, and a card Skia cannot draw shows `fallback` (the picture it had before).
 * Without a design nothing here loads Skia.
 */
import React from 'react';
import { skiaAvailable } from '@/lib/card-design/skia-available';

type DesignedCardType = typeof import('./DesignedCard').default;
export type SafeDesignedCardProps = React.ComponentProps<DesignedCardType> & { fallback: React.ReactNode };

let loaded: DesignedCardType | null | undefined;

/** The DesignedCard component, or null when Skia is not usable in this binary. */
export function loadDesignedCard(): DesignedCardType | null {
  if (loaded !== undefined) return loaded;
  if (!skiaAvailable()) return (loaded = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('./DesignedCard').default as DesignedCardType;
  } catch (err) {
    console.warn('[DesignedCard] Skia could not be loaded:', err instanceof Error ? err.message : err);
    loaded = null;
  }
  return loaded;
}

class Boundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[DesignedCard] drawing failed:', err instanceof Error ? err.message : err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function SafeDesignedCard({ fallback, ...props }: SafeDesignedCardProps) {
  const C = loadDesignedCard();
  if (!C) return <>{fallback}</>;
  return (
    <Boundary fallback={fallback}>
      <C {...props} fallback={fallback} />
    </Boundary>
  );
}

/** Tests: forget the loaded component. */
export function resetDesignedCardForTests(): void {
  loaded = undefined;
}
