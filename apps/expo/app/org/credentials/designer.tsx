// Ausweis-Designer (D4). The screen itself lives in components/credentials/designer/DesignerScreen
// and is loaded only when the binary has Skia (SkiaScreenGate).
import React from 'react';
import { SkiaScreenGate } from '@/components/credentials/designer/SkiaScreenGate';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => require('@/components/credentials/designer/DesignerScreen').default as React.ComponentType;

export default function DesignerRoute() {
  return <SkiaScreenGate title="Ausweis-Designer" load={load} />;
}
