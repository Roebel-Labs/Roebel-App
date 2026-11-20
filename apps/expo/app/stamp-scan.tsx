// Old entry for the never-finished partner stamp card. Event stamps are collected with the app's
// scanner (Smart Event QR → app/e/[id].tsx, plan 3b open question 3), so this route forwards
// there; old links and buttons reach the working flow.
import React from 'react';
import { Redirect } from 'expo-router';

export default function StampScanScreen() {
  return <Redirect href={'/verification/scan' as any} />;
}
