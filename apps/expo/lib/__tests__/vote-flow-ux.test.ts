import {
  AGE_CONFIRMED_DEVICE_KEY,
  AGE_CONFIRMED_VALUE,
  ageConfirmedKey,
  chooseStoredKeypair,
  maciKeypairAccountKey,
  MACI_KEYPAIR_DEVICE_KEY,
  persistAgeConfirmed,
  pickLastVote,
  readAgeConfirmed,
  shouldAutoCast,
  type AgeFlagStorage,
  type LocalVoteRecord,
} from '@/lib/vote-flow';

const CHECKSUM = '0xAbCdEf0000000000000000000000000000000001';
const LOWER = CHECKSUM.toLowerCase();
const OTHER = '0x2222222222222222222222222222222222222222';

function memStorage(seed: { secure?: Record<string, string>; async?: Record<string, string> } = {}) {
  const secure = new Map(Object.entries(seed.secure ?? {}));
  const async_ = new Map(Object.entries(seed.async ?? {}));
  const st: AgeFlagStorage = {
    secureGet: async (k) => secure.get(k) ?? null,
    secureSet: async (k, v) => void secure.set(k, v),
    asyncGet: async (k) => async_.get(k) ?? null,
    asyncSet: async (k, v) => void async_.set(k, v),
  };
  return { st, secure, async_ };
}

describe('age 16+ is asked once per device', () => {
  it('nothing stored → not confirmed', async () => {
    const { st } = memStorage();
    expect(await readAgeConfirmed(CHECKSUM, st)).toBe(false);
  });

  it('the old per-account SecureStore flag still counts (no re-ask after the update)', async () => {
    const { st, async_ } = memStorage({ secure: { [ageConfirmedKey(LOWER)]: AGE_CONFIRMED_VALUE } });
    expect(await readAgeConfirmed(CHECKSUM, st)).toBe(true);
    // … and back-fills the device flag.
    expect(async_.get(AGE_CONFIRMED_DEVICE_KEY)).toBe(AGE_CONFIRMED_VALUE);
  });

  it('checksummed and lower-case address share one flag', async () => {
    const { st } = memStorage();
    await persistAgeConfirmed(CHECKSUM, st);
    expect(await readAgeConfirmed(LOWER, st)).toBe(true);
  });

  it('the device flag covers a different active address (thirdweb ↔ passkey)', async () => {
    const { st } = memStorage();
    await persistAgeConfirmed(CHECKSUM, st);
    expect(await readAgeConfirmed(OTHER, st)).toBe(true);
  });

  it('persists to device + per-account AsyncStorage + SecureStore', async () => {
    const { st, secure, async_ } = memStorage();
    await persistAgeConfirmed(CHECKSUM, st);
    expect(async_.get(AGE_CONFIRMED_DEVICE_KEY)).toBe(AGE_CONFIRMED_VALUE);
    expect(async_.get(ageConfirmedKey(LOWER))).toBe(AGE_CONFIRMED_VALUE);
    expect(secure.get(ageConfirmedKey(LOWER))).toBe(AGE_CONFIRMED_VALUE);
  });

  it('a failing keychain neither throws nor loses the flag', async () => {
    const { st } = memStorage();
    st.secureGet = async () => {
      throw new Error('keystore');
    };
    st.secureSet = async () => {
      throw new Error('keystore');
    };
    await expect(persistAgeConfirmed(CHECKSUM, st)).resolves.toBeUndefined();
    expect(await readAgeConfirmed(CHECKSUM, st)).toBe(true);
  });

  it('a legacy birthdate counts', async () => {
    const { st } = memStorage();
    st.loadBirthdate = async () => '2001-04-02';
    expect(await readAgeConfirmed(CHECKSUM, st)).toBe(true);
  });
});

describe('voting key is reused, never re-derived per poll', () => {
  const kp = (pub: string) => JSON.stringify({ privKey: 'macisk.x', pubKey: pub, pubX: '1', pubY: '2' });

  it('per-account slot key is lower-cased and namespaced under the v1 device slot', () => {
    expect(maciKeypairAccountKey(CHECKSUM)).toBe(`${MACI_KEYPAIR_DEVICE_KEY}.${LOWER}`);
    expect(MACI_KEYPAIR_DEVICE_KEY).toBe('roebel.maci.keypair.v1');
  });

  it("the account's own key wins over the device slot", () => {
    expect(chooseStoredKeypair(kp('macipk.a'), kp('macipk.d'))).toEqual({ raw: kp('macipk.a'), source: 'account' });
  });

  it('existing installs keep using the device slot (no new key, no new signature)', () => {
    expect(chooseStoredKeypair(null, kp('macipk.d'))).toEqual({ raw: kp('macipk.d'), source: 'device' });
  });

  it('garbage is ignored', () => {
    expect(chooseStoredKeypair('{', 'null')).toBeNull();
    expect(chooseStoredKeypair('{"pubX":1}', kp('macipk.d'))?.source).toBe('device');
  });
});

describe('no second confirmation', () => {
  const base = {
    sheetOpen: true,
    step: 'vote' as const,
    choice: 1,
    busy: false,
    hasError: false,
    alreadyAttempted: false,
    ready: true,
  };

  it('casts as soon as the vote step is reached', () => {
    expect(shouldAutoCast(base)).toBe(true);
  });

  it.each([
    ['sheet closed', { sheetOpen: false }],
    ['other step', { step: 'signup' as const }],
    ['still checking', { step: 'checking' as const }],
    ['no choice', { choice: null }],
    ['busy', { busy: true }],
    ['after an error (retry is a tap)', { hasError: true }],
    ['only once per run', { alreadyAttempted: true }],
    ['wallet / poll not ready', { ready: false }],
  ])('does not cast: %s', (_label, patch) => {
    expect(shouldAutoCast({ ...base, ...patch })).toBe(false);
  });
});

describe('own vote shows right after casting', () => {
  const rec = (optionIndex: number, votedAt: number, txHash = '0xabc'): LocalVoteRecord => ({
    pollAddress: LOWER,
    optionIndex,
    nonce: '1',
    txHash,
    votedAt,
  });

  it('a just-cast vote shows before the tx settles', () => {
    expect(pickLastVote(null, rec(1, 100, ''))?.optionIndex).toBe(1);
  });

  it('a changed vote (newer pending) replaces the confirmed one', () => {
    expect(pickLastVote(rec(0, 100), rec(2, 200, ''))?.optionIndex).toBe(2);
  });

  it('without a pending record the confirmed one stays', () => {
    expect(pickLastVote(rec(0, 100), null)?.optionIndex).toBe(0);
    expect(pickLastVote(null, null)).toBeNull();
  });
});
