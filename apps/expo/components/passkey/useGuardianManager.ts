/**
 * State + actions of "Vertrauenspersonen" for this device's passkey Safe. Every change is ONE
 * sponsored userOp from the Safe (mode "legacy" while citizenship sits on the legacy account,
 * "safe" after the v3 move) signed with one fingerprint.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { MigrationRecord } from '@/lib/passkey/migration';
import type { IdentityMode } from '@/lib/passkey/guardian-plan';
import {
  allGuardiansAreAttesters,
  defaultThreshold,
  pendingSuggestions,
  planAddGuardians,
  planChangeThreshold,
  planRemoveGuardian,
} from '@/lib/passkey/guardian-plan';
import type { Person } from '@/lib/passkey/people';
import { suggestDefaultGuardians, type SuggestedGuardian } from '@/lib/passkey/recovery-lookup';
import type { SponsoredCall } from '@/lib/passkey/userop';
import {
  isAttester,
  lookupChain,
  readGuardianState,
  readIdentityMode,
  resolvePeopleNow,
  saveLabel,
  sendOwnSafeOp,
} from '@/lib/passkey/guardians-runtime';
import { friendlyError, type NoticeTone } from './PasskeyUi';

export type GuardianAction = 'suggestion' | 'add' | 'remove' | 'threshold' | null;

export function useGuardianManager(record: MigrationRecord | null) {
  const [loading, setLoading] = useState(true);
  const [guardians, setGuardians] = useState<Address[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [mode, setMode] = useState<IdentityMode | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [attesters, setAttesters] = useState<Set<string>>(new Set());
  const [suggested, setSuggested] = useState<SuggestedGuardian[]>([]);
  const [busy, setBusy] = useState<GuardianAction>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    try {
      const [state, identity] = await Promise.all([
        readGuardianState(record.safe),
        readIdentityMode(record).catch(() => null),
      ]);
      // The suggestion needs the legacy account the citizen was attested on.
      const sugg = record.legacy
        ? await suggestDefaultGuardians({ citizen: record.legacy, wallet: record.safe }, lookupChain).catch(
            () => [] as SuggestedGuardian[],
          )
        : [];
      const addresses = [...state.guardians, ...sugg.map((s) => s.guardian), ...sugg.map((s) => s.approver)];
      const resolved = await resolvePeopleNow(addresses);
      // Suggested Safes are named after the attester who approved.
      for (const s of sugg) {
        const approverPerson = resolved.get(s.approver.toLowerCase());
        const g = resolved.get(s.guardian.toLowerCase());
        if (approverPerson?.known && g && !g.known) {
          resolved.set(s.guardian.toLowerCase(), { ...approverPerson, address: s.guardian });
        }
      }
      const attesterFlags = new Set<string>();
      for (const s of sugg) attesterFlags.add(s.guardian.toLowerCase());
      await Promise.all(
        state.guardians.map(async (g) => {
          const profile = resolved.get(g.toLowerCase())?.profileWallet;
          const checks = [isAttester(g), ...(profile && profile.toLowerCase() !== g.toLowerCase() ? [isAttester(profile)] : [])];
          if ((await Promise.all(checks)).some(Boolean)) attesterFlags.add(g.toLowerCase());
        }),
      );
      if (!alive.current) return;
      setGuardians(state.guardians);
      setThreshold(state.threshold);
      setMode(identity);
      setSuggested(sugg);
      setPeople(resolved);
      setAttesters(attesterFlags);
    } catch (e) {
      if (alive.current) setNotice({ tone: 'error', text: friendlyError(e, 'Deine Vertrauenspersonen konnten nicht geladen werden.') ?? '' });
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [record]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const run = useCallback(
    async (action: Exclude<GuardianAction, null>, calls: SponsoredCall[], success: string): Promise<boolean> => {
      if (!record || calls.length === 0) return false;
      if (!mode) {
        setNotice({ tone: 'warning', text: 'Das geht erst, wenn dein Passkey mit deinem Bürgerkonto verbunden ist.' });
        return false;
      }
      setBusy(action);
      setNotice(null);
      try {
        await sendOwnSafeOp(record, mode, calls);
        if (alive.current) setNotice({ tone: 'success', text: success });
        await load();
        return true;
      } catch (e) {
        const msg = friendlyError(e);
        if (msg && alive.current) setNotice({ tone: 'error', text: msg });
        return false;
      } finally {
        if (alive.current) setBusy(null);
      }
    },
    [record, mode, load],
  );

  const exclude: Address[] = record ? [record.safe, ...(record.legacy ? [record.legacy] : [])] : [];
  const pending = pendingSuggestions({ suggested: suggested.map((s) => s.guardian), current: guardians, exclude });

  const adoptSuggestion = useCallback(async () => {
    if (!record) return false;
    for (const s of suggested) {
      const p = people.get(s.guardian.toLowerCase());
      if (p?.known) await saveLabel(s.guardian, p.name).catch(() => undefined);
    }
    const plan = planAddGuardians({ wallet: record.safe, current: guardians, currentThreshold: threshold, add: pending, threshold: 2 });
    return run('suggestion', plan.calls, 'Vorschlag übernommen.');
  }, [record, suggested, people, guardians, threshold, pending, run]);

  const addGuardian = useCallback(
    async (address: Address, name: string) => {
      if (!record) return false;
      await saveLabel(address, name).catch(() => undefined);
      const plan = planAddGuardians({ wallet: record.safe, current: guardians, currentThreshold: threshold, add: [address] });
      if (plan.calls.length === 0) {
        setNotice({ tone: 'info', text: `${name} ist schon dabei.` });
        return false;
      }
      return run('add', plan.calls, `${name} ist jetzt deine Vertrauensperson.`);
    },
    [record, guardians, threshold, run],
  );

  const removeGuardian = useCallback(
    async (address: Address) => {
      const name = people.get(address.toLowerCase())?.name ?? 'Die Person';
      const { call } = planRemoveGuardian({ current: guardians, currentThreshold: threshold, guardian: address });
      return run('remove', [call], `${name} ist keine Vertrauensperson mehr.`);
    },
    [guardians, threshold, people, run],
  );

  const changeThreshold = useCallback(
    async (next: number) => run('threshold', [planChangeThreshold(guardians.length, next)], 'Gespeichert.'),
    [guardians.length, run],
  );

  return {
    loading,
    guardians,
    threshold,
    mode,
    people,
    pending,
    busy,
    notice,
    setNotice,
    exclude: [...exclude, ...guardians],
    allAttesters: allGuardiansAreAttesters(guardians, (g) => attesters.has(g.toLowerCase())),
    suggestedThreshold: defaultThreshold(guardians.length + pending.length),
    reload: load,
    adoptSuggestion,
    addGuardian,
    removeGuardian,
    changeThreshold,
  };
}
