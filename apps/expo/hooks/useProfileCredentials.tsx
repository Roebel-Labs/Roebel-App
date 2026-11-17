/**
 * The profile's cards and badges. Closed gate (or still loading): exactly today's built-in cards,
 * and `useHeld` is not even mounted, so nothing touches the credential routes. Open gate: a hidden
 * loader component mounts `useHeld` and the register entries join the built-in cards.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { useHeld, type HeldCredential } from '@/lib/credreg/held';
import { buildProfile, type Profile } from '@/lib/credreg/model';
import type { InvitationView } from '@/lib/credreg/types';

type Snapshot = {
  held: HeldCredential[];
  pending: InvitationView[];
  refresh: () => Promise<void>;
  loading: boolean;
};

const EMPTY_HELD: HeldCredential[] = [];
const EMPTY_PENDING: InvitationView[] = [];
const noop = async () => {};

/** Mounted only while the gate is open: reports `useHeld` to the profile. Renders nothing. */
function HeldLoader({ onChange }: { onChange: (s: Snapshot) => void }) {
  const h = useHeld();
  // Stable empties: useHeld returns a fresh [] per render before anything loaded.
  const held = h.held.length > 0 ? h.held : EMPTY_HELD;
  const pending = h.pending.length > 0 ? h.pending : EMPTY_PENDING;
  const { loading } = h;
  // Latest refresh through a ref: its identity must not re-trigger the report.
  const refreshRef = useRef(h.refresh);
  useEffect(() => {
    refreshRef.current = h.refresh;
  });
  const [refresh] = useState(() => () => refreshRef.current());
  useEffect(() => {
    onChange({ held, pending, refresh, loading });
  }, [held, pending, refresh, loading, onChange]);
  return null;
}

export type ProfileCredentials = {
  /** Gate open: register entries, badge grid and detail sheet are live. */
  open: boolean;
  profile: Profile;
  held: HeldCredential[];
  pending: InvitationView[];
  refresh: () => Promise<void>;
  /** Render this somewhere in the screen (null while closed). */
  loader: React.ReactElement | null;
};

export function useProfileCredentials(input: { isCitizen: boolean; isAttester: boolean }): ProfileCredentials {
  const gate = useCredentialsGate();
  const open = gate === true;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const held = open && snap ? snap.held : EMPTY_HELD;
  const pending = open && snap ? snap.pending : EMPTY_PENDING;
  const { isCitizen, isAttester } = input;
  // Expiry is judged at mount; the profile screen remounts often enough for a day-level date.
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));
  const profile = useMemo(
    () => buildProfile({ isCitizen, isAttester, held, nowSec }),
    [isCitizen, isAttester, held, nowSec],
  );
  return {
    open,
    profile,
    held,
    pending,
    refresh: open && snap ? snap.refresh : noop,
    loader: open ? <HeldLoader onChange={setSnap} /> : null,
  };
}
