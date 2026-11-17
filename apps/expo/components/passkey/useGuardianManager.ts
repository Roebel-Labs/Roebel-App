/**
 * State + actions of "Vertrauenspersonen" for this device's passkey Safe. Every change is ONE
 * sponsored userOp from the Safe (mode "legacy" while citizenship sits on the legacy account,
 * "safe" after the v3 move) signed with one fingerprint.
 *
 * Every change goes through `planGuardianSet` with an explicit threshold, so when recovery words
 * are on, the number of word guardians follows the threshold in the same op.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { MigrationRecord } from '@/lib/passkey/migration';
import type { IdentityMode } from '@/lib/passkey/guardian-plan';
import {
  allGuardiansAreAttesters,
  clampThreshold,
  defaultThreshold,
  isValidThreshold,
  pendingSuggestions,
} from '@/lib/passkey/guardian-plan';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import { loadWordsPool, planGuardianSet, splitGuardians, type WordsPool } from '@/lib/passkey/words-guardians';
import type { Person } from '@/lib/passkey/people';
import { helperDisplay, planAddRecoveryHelper, type HelperMeta } from '@/lib/passkey/recovery-helper';
import type { HelperLogin } from '@/lib/passkey/recovery-helper-runtime';
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

export type GuardianAction = 'suggestion' | 'add' | 'helper' | 'remove' | 'threshold' | null;

export function useGuardianManager(record: MigrationRecord | null) {
  const [loading, setLoading] = useState(true);
  const [guardians, setGuardians] = useState<Address[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [pool, setPool] = useState<WordsPool | null>(null);
  const [mode, setMode] = useState<IdentityMode | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [attesters, setAttesters] = useState<Set<string>>(new Set());
  const [suggested, setSuggested] = useState<SuggestedGuardian[]>([]);
  const [helpers, setHelpers] = useState<Record<string, HelperMeta>>({});
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
      const [state, identity, wordsPool] = await Promise.all([
        readGuardianState(record.safe),
        readIdentityMode(record).catch(() => null),
        loadWordsPool(secureKeyValueStorage).catch(() => null),
      ]);
      // Word guardians are never resolved or shown as people.
      const peopleOnChain = splitGuardians(state.guardians, wordsPool).people;
      // The suggestion needs the legacy account the citizen was attested on.
      const sugg = record.legacy
        ? await suggestDefaultGuardians({ citizen: record.legacy, wallet: record.safe }, lookupChain).catch(
            () => [] as SuggestedGuardian[],
          )
        : [];
      const addresses = [...peopleOnChain, ...sugg.map((s) => s.guardian), ...sugg.map((s) => s.approver)];
      const [resolved, helperMetas] = await Promise.all([
        resolvePeopleNow(addresses),
        import('@/lib/passkey/recovery-helper-runtime').then((rt) => rt.loadHelpers()).catch(() => ({}) as Record<string, HelperMeta>),
      ]);
      // A recovery helper is shown as "Google-Konto (Helfer)" etc., never by address.
      for (const g of peopleOnChain) {
        const meta = helperMetas[g.toLowerCase()];
        if (meta) {
          resolved.set(g.toLowerCase(), { address: g, name: helperDisplay(meta).name, known: true, avatarUrl: null, profileWallet: null });
        }
      }
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
        peopleOnChain.map(async (g) => {
          const profile = resolved.get(g.toLowerCase())?.profileWallet;
          const checks = [isAttester(g), ...(profile && profile.toLowerCase() !== g.toLowerCase() ? [isAttester(profile)] : [])];
          if ((await Promise.all(checks)).some(Boolean)) attesterFlags.add(g.toLowerCase());
        }),
      );
      if (!alive.current) return;
      setGuardians(state.guardians);
      setThreshold(state.threshold);
      setPool(wordsPool);
      setMode(identity);
      setSuggested(sugg);
      setPeople(resolved);
      setAttesters(attesterFlags);
      setHelpers(helperMetas);
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
        setNotice({ tone: 'warning', text: record.legacy ? 'Das geht erst, wenn dein Passkey mit deinem Bürgerkonto verbunden ist.' : 'Das geht gerade nicht. Versuche es gleich noch einmal.' });
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

  const { people: peopleGuardians, words: wordGuardians } = splitGuardians(guardians, pool);

  /**
   * The calls for "these people, this threshold" with words kept as they are (on stays on and
   * follows the threshold). Shows the refusal as a notice and returns null when it cannot be planned.
   */
  const planSet = useCallback(
    (nextPeople: readonly Address[], nextThreshold: number): SponsoredCall[] | null => {
      if (!record) return null;
      try {
        return planGuardianSet({
          wallet: record.safe,
          current: guardians,
          pool,
          people: nextPeople,
          words: wordGuardians.length > 0,
          threshold: nextThreshold,
          currentThreshold: threshold,
        }).calls;
      } catch (e) {
        setNotice({ tone: 'warning', text: e instanceof Error ? e.message : 'Das geht gerade nicht.' });
        return null;
      }
    },
    [record, guardians, pool, wordGuardians.length, threshold],
  );

  const exclude: Address[] = record ? [record.safe, ...(record.legacy ? [record.legacy] : [])] : [];
  const pending = pendingSuggestions({ suggested: suggested.map((s) => s.guardian), current: guardians, exclude });

  const adoptSuggestion = useCallback(async () => {
    if (!record) return false;
    for (const s of suggested) {
      const p = people.get(s.guardian.toLowerCase());
      if (p?.known) await saveLabel(s.guardian, p.name).catch(() => undefined);
    }
    const calls = planSet([...peopleGuardians, ...pending], 2);
    return calls ? run('suggestion', calls, 'Vorschlag übernommen.') : false;
  }, [record, suggested, people, peopleGuardians, pending, planSet, run]);

  const addGuardian = useCallback(
    async (address: Address, name: string) => {
      if (!record) return false;
      await saveLabel(address, name).catch(() => undefined);
      const already =
        address.toLowerCase() === record.safe.toLowerCase() || guardians.some((g) => g.toLowerCase() === address.toLowerCase());
      if (already) {
        setNotice({ tone: 'info', text: `${name} ist schon dabei.` });
        return false;
      }
      const nextPeople = [...peopleGuardians, address];
      const calls = planSet(nextPeople, Math.max(threshold, defaultThreshold(nextPeople.length)));
      return calls ? run('add', calls, `${name} ist jetzt deine Vertrauensperson.`) : false;
    },
    [record, guardians, peopleGuardians, threshold, planSet, run],
  );

  /**
   * "E-Mail oder Google als Helfer": thirdweb login outside the connection manager → its Gnosis
   * smart account → addGuardianWithThreshold in ONE sponsored passkey op. The helper login is
   * ended right after its address is known (it must never become the app's session).
   */
  const addHelper = useCallback(
    async (login: HelperLogin): Promise<boolean> => {
      if (!record) return false;
      if (!mode) {
        setNotice({ tone: 'warning', text: record.legacy ? 'Das geht erst, wenn dein Passkey mit deinem Bürgerkonto verbunden ist.' : 'Das geht gerade nicht. Versuche es gleich noch einmal.' });
        return false;
      }
      setBusy('helper');
      setNotice(null);
      const rt = await import('@/lib/passkey/recovery-helper-runtime');
      let session: Awaited<ReturnType<typeof rt.signInHelper>>;
      try {
        session = await rt.signInHelper(login);
      } catch (e) {
        const msg = e instanceof Error && /Zeitüberschreitung/.test(e.message) ? e.message : null;
        if (alive.current) {
          setBusy(null);
          // A closed Google/Apple sheet is not an error worth a red box.
          setNotice(msg ? { tone: 'error', text: msg } : { tone: 'info', text: 'Die Anmeldung wurde nicht abgeschlossen.' });
        }
        return false;
      }
      const plan = planAddRecoveryHelper({
        wallet: record.safe,
        legacy: record.legacy ?? null,
        current: guardians,
        currentThreshold: threshold,
        helper: session.account.address as Address,
      });
      if (plan.kind === 'self') {
        // This login IS the person's own (legacy) account: keep it as it was, add nothing.
        if (alive.current) {
          setBusy(null);
          setNotice({ tone: 'warning', text: 'Das ist dein eigenes Konto. Nimm ein anderes Google- oder E-Mail-Konto als Helfer.' });
        }
        return false;
      }
      await rt.endHelperSession(session);
      if (plan.kind !== 'add') {
        if (alive.current) {
          setBusy(null);
          setNotice({
            tone: 'info',
            text: plan.kind === 'exists' ? 'Dieses Konto ist schon dein Helfer.' : 'Dieses Konto kann kein Helfer sein.',
          });
        }
        return false;
      }
      await rt.saveHelper(plan.helper, session.meta).catch(() => undefined);
      setBusy(null);
      // Same threshold rule as planAddRecoveryHelper, counted over people only.
      const helperThreshold = peopleGuardians.length === 0 ? 1 : clampThreshold(threshold, peopleGuardians.length + 1);
      const calls = planSet([...peopleGuardians, plan.helper], helperThreshold);
      return calls ? run('helper', calls, `${helperDisplay(session.meta).name} hilft dir jetzt beim Wiederherstellen.`) : false;
    },
    [record, mode, guardians, peopleGuardians, threshold, planSet, run],
  );

  const removeGuardian = useCallback(
    async (address: Address) => {
      const name = people.get(address.toLowerCase())?.name ?? 'Die Person';
      const nextPeople = peopleGuardians.filter((g) => g.toLowerCase() !== address.toLowerCase());
      const calls = planSet(nextPeople, clampThreshold(threshold, nextPeople.length));
      return calls ? run('remove', calls, `${name} ist keine Vertrauensperson mehr.`) : false;
    },
    [peopleGuardians, threshold, people, planSet, run],
  );

  const changeThreshold = useCallback(
    async (next: number) => {
      if (!isValidThreshold(next, peopleGuardians.length)) {
        setNotice({ tone: 'warning', text: `Wähle eine Zahl zwischen 1 und ${peopleGuardians.length}.` });
        return false;
      }
      const calls = planSet(peopleGuardians, next);
      return calls ? run('threshold', calls, 'Gespeichert.') : false;
    },
    [peopleGuardians, planSet, run],
  );

  return {
    loading,
    guardians,
    /** The people among the guardians (what the list shows and the threshold counts). */
    peopleGuardians,
    /** The word guardians on chain (shown as one entry "Wiederherstellungswörter"). */
    wordGuardians,
    threshold,
    mode,
    people,
    pending,
    busy,
    notice,
    setNotice,
    helpers,
    exclude: [...exclude, ...guardians],
    allAttesters: allGuardiansAreAttesters(peopleGuardians, (g) => attesters.has(g.toLowerCase())),
    suggestedThreshold: defaultThreshold(peopleGuardians.length + pending.length),
    reload: load,
    adoptSuggestion,
    addGuardian,
    addHelper,
    removeGuardian,
    changeThreshold,
  };
}
