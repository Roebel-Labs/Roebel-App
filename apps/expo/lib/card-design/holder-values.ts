// The personal fields of a card, filled on the holder's own device only (spec §7): verified
// citizens see their verified first and last name (from the on-device verification preimage),
// everyone else their display name. Nothing here is ever sent to the server.
import { useEffect, useMemo, useState } from 'react';
import { formatDate, type FieldValues } from '@roebel/card-design';
import { loadCitizenPreimage } from '@/lib/citizen-commitment';

export type VerifiedName = { first: string; last: string };

export type HolderInput = {
  verifiedName: VerifiedName | null;
  displayName: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
};

export function holderValues(input: HolderInput): FieldValues {
  const out: FieldValues = {};
  const verified = input.verifiedName
    ? [input.verifiedName.first.trim(), input.verifiedName.last.trim()].filter(Boolean).join(' ')
    : '';
  const name = verified || (input.displayName ?? '').trim();
  if (name) out.holderName = name;
  const until = input.validUntil ? formatDate(input.validUntil, 'de') : '';
  if (until) out.validUntil = until;
  const since = input.acceptedAt ? formatDate(input.acceptedAt, 'de') : '';
  if (since) out.memberSince = since;
  return out;
}

/** What the holder's cards need to know about the holder: verified name (if any) and display name. */
export type Holder = { verifiedName: VerifiedName | null; displayName: string | null };

/** The holder of `address`: the verified name from this device's preimage, plus the display name. */
export function useHolder(address: string | null | undefined, displayName: string | null): Holder {
  const [verifiedName, setVerifiedName] = useState<VerifiedName | null>(null);
  useEffect(() => {
    setVerifiedName(null);
    if (!address) return;
    let alive = true;
    loadCitizenPreimage(address)
      .then((p) => {
        if (alive && p && typeof p.firstName === 'string' && typeof p.lastName === 'string') {
          setVerifiedName({ first: p.firstName, last: p.lastName });
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [address]);
  return useMemo(() => ({ verifiedName, displayName }), [verifiedName, displayName]);
}

/** Field values of one card for its holder. `validUntil` in unix seconds (null = forever). */
export function cardHolderValues(holder: Holder | null | undefined, validUntilSec: number | null): FieldValues {
  return holderValues({
    verifiedName: holder?.verifiedName ?? null,
    displayName: holder?.displayName ?? null,
    validUntil: validUntilSec !== null ? new Date(validUntilSec * 1000).toISOString() : null,
    acceptedAt: null,
  });
}
