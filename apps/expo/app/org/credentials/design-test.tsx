// Test preview of a card design (D4, opened from the test push). The screen lives in
// components/credentials/designer/DesignTestScreen and is loaded only when the binary has Skia.
import React from 'react';
import { SkiaScreenGate } from '@/components/credentials/designer/SkiaScreenGate';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => require('@/components/credentials/designer/DesignTestScreen').default as React.ComponentType;

export default function DesignTestRoute() {
  return <SkiaScreenGate title="Entwurf testen" load={load} />;
}
