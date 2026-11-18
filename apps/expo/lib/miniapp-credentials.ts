/**
 * The credentials this person holds, in the shape mini-app matching takes (`credentialMatches`
 * from the SDK): a built-in name or `type:<typeId>`, plus the issuing org's account id.
 *
 * This is the one place on the device where the credential register plugs into mini-app
 * matching. Everything stays on the phone: private holdings (accepted invitations) are matched
 * here exactly like public ones and are never logged, tracked or sent. The only request this
 * file causes is the public type directory, which is unsigned and the same for everyone.
 */
import { useEffect, useMemo, useState } from 'react';
import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import { useUser } from '@/context/UserContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useWalletBoot } from '@/context/WalletBootContext';
import { credentialKindsFor } from '@/lib/credentials';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { loadTypeDirectory, useHeld } from '@/lib/credreg/held';

/**
 * One held credential for matching. Named so it does not collide with the register's own
 * `HeldCredential` (lib/credreg/held.ts).
 */
export interface MatchCredential {
  type: string;
  org?: string;
}

const TYPE_ID_RE = /^0x[0-9a-fA-F]{64}$/;
const RESERVED = new Set(Object.values(RESERVED_TYPE_IDS).map((id) => String(id).toLowerCase()));

/** Signed out → nothing; otherwise the same cards the profile shows (an attester is a citizen too). */
export function builtinMatchCredentials(p: { signedIn: boolean; isCitizen: boolean; isAttester: boolean }): MatchCredential[] {
  if (!p.signedIn) return [];
  return credentialKindsFor({ isCitizen: p.isCitizen, isAttester: p.isAttester }).map((type) => ({ type }));
}

/**
 * One entry per held, unexpired register credential (public and private), with its org from
 * the type directory. Reserved type ids are skipped: the built-ins stand for them.
 */
export function registerMatchCredentials(
  held: readonly { typeId: string; validUntil: number | null }[],
  directory: readonly { typeId: string; orgAccountId: string | null }[],
  nowSec: number,
): MatchCredential[] {
  const orgOf = new Map(directory.map((d) => [d.typeId.toLowerCase(), d.orgAccountId ? d.orgAccountId.toLowerCase() : null]));
  const seen = new Set<string>();
  const out: MatchCredential[] = [];
  for (const h of held) {
    if (typeof h.typeId !== 'string' || !TYPE_ID_RE.test(h.typeId)) continue;
    const id = h.typeId.toLowerCase();
    if (RESERVED.has(id) || seen.has(id)) continue;
    if (h.validUntil !== null && h.validUntil < nowSec) continue;
    seen.add(id);
    const org = orgOf.get(id);
    out.push(org ? { type: `type:${id}`, org } : { type: `type:${id}` });
  }
  return out;
}

/**
 * The signed-in person's credentials for matching. Built-ins come from the user and the
 * attester flag; when the register gate is open, the register's holdings are merged in.
 * `ready` turns true once the answer will not grow any more by itself (wallet restored,
 * NFT status read, register gate decided and, when open, the directory loaded).
 */
export function useMatchCredentials(): { held: MatchCredential[]; ready: boolean } {
  const { isCitizen, isConnected, isLoading: userLoading } = useUser();
  const { hasAttesterNFT, nftStatus } = useVerificationContext();
  const { autoConnectFinished } = useWalletBoot();
  const gate = useCredentialsGate();
  const { held: registerHeld, loading: heldLoading } = useHeld();

  const registerOn = gate === true && !!isConnected;
  // The register's answer, tagged with the holdings list it was computed from. Computed in a
  // promise callback (directory fetch, expiry against the current time), so render stays pure.
  // `useHeld` hands out a new empty array on every render, so the content is the key.
  const heldKey = registerHeld.map((h) => `${h.typeId}:${h.validUntil ?? ''}`).join(',');
  const [register, setRegister] = useState<{ from: string; list: MatchCredential[] } | null>(null);

  useEffect(() => {
    if (!registerOn) return;
    let cancelled = false;
    const directory = registerHeld.length > 0 ? loadTypeDirectory().catch(() => null) : Promise.resolve(null);
    directory.then((d) => {
      if (cancelled) return;
      setRegister({ from: heldKey, list: registerMatchCredentials(registerHeld, d ?? [], Math.floor(Date.now() / 1000)) });
    });
    return () => {
      cancelled = true;
    };
    // registerHeld is read through heldKey (its content); its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerOn, heldKey]);

  const signedIn = !!isConnected;
  const isAttester = !!hasAttesterNFT;
  const registerCurrent = registerOn && register?.from === heldKey ? register.list : null;
  const held = useMemo(() => {
    const builtins = builtinMatchCredentials({ signedIn, isCitizen: !!isCitizen, isAttester });
    return registerCurrent ? [...builtins, ...registerCurrent] : builtins;
  }, [signedIn, isCitizen, isAttester, registerCurrent]);

  const userReady = !!autoConnectFinished && (!signedIn || (!userLoading && !nftStatus?.isLoading));
  const registerReady = !signedIn || gate === false || (gate === true && !heldLoading && registerCurrent !== null);
  return { held, ready: userReady && registerReady };
}
