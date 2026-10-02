const mockStore: Record<string, string> = {};
jest.mock('@/lib/storage/secureStorage', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
}));

const mockEnsureIdentity = jest.fn(async () => {});
const mockGetRegisteredAt = jest.fn(async () => 123);
jest.mock('../nostr/identity', () => ({ ensureIdentitySilently: mockEnsureIdentity, getRegisteredAt: mockGetRegisteredAt }));

const mockEnsureProfile = jest.fn(async () => {});
const mockRetryPending = jest.fn(async () => {});
jest.mock('../nostr/publish', () => ({ ensureProfilePublished: mockEnsureProfile, retryPendingPublications: mockRetryPending }));

import { ENROLL_NON_CITIZENS, enrollNow, markPublicRecordConsent, mayEnroll, selfHealEnrollment } from '../nostr/enroll';

const account = { address: '0xabc' } as any;

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
});

describe('selfHealEnrollment', () => {
  it('does nothing without consent', async () => {
    await selfHealEnrollment(account, true);
    expect(mockEnsureIdentity).not.toHaveBeenCalled();
    expect(mockEnsureProfile).not.toHaveBeenCalled();
  });

  it('enrolls a citizen with consent', async () => {
    await markPublicRecordConsent();
    await selfHealEnrollment(account, true);
    expect(mockEnsureIdentity).toHaveBeenCalledWith(account);
    expect(mockEnsureProfile).toHaveBeenCalledWith('0xabc');
    expect(mockRetryPending).toHaveBeenCalledWith('0xabc');
  });

  it('skips publishing when the identity is not registered', async () => {
    mockGetRegisteredAt.mockResolvedValueOnce(0);
    await markPublicRecordConsent();
    await selfHealEnrollment(account, true);
    expect(mockEnsureIdentity).toHaveBeenCalled();
    expect(mockEnsureProfile).not.toHaveBeenCalled();
  });
});

describe('non-citizens while ENROLL_NON_CITIZENS is off', () => {
  it('the flag is off until a consent version covers every account', () => {
    expect(ENROLL_NON_CITIZENS).toBe(false);
    expect(mayEnroll(false)).toBe(false);
    expect(mayEnroll(true)).toBe(true);
  });

  it('self-heal neither binds a key nor publishes a profile or backfill', async () => {
    await markPublicRecordConsent();
    await selfHealEnrollment(account, false);
    expect(mockEnsureIdentity).not.toHaveBeenCalled();
    expect(mockEnsureProfile).not.toHaveBeenCalled();
    expect(mockRetryPending).not.toHaveBeenCalled();
  });

  it('enrollNow at consent time does nothing for them', async () => {
    await enrollNow(account, false);
    expect(mockEnsureIdentity).not.toHaveBeenCalled();
    expect(mockRetryPending).not.toHaveBeenCalled();
  });
});
