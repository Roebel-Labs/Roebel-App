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

import { markPublicRecordConsent, selfHealEnrollment } from '../nostr/enroll';

const account = { address: '0xabc' } as any;

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
});

describe('selfHealEnrollment', () => {
  it('does nothing without consent', async () => {
    await selfHealEnrollment(account);
    expect(mockEnsureIdentity).not.toHaveBeenCalled();
    expect(mockEnsureProfile).not.toHaveBeenCalled();
  });

  it('enrolls with consent, without any citizenship argument', async () => {
    await markPublicRecordConsent();
    await selfHealEnrollment(account);
    expect(mockEnsureIdentity).toHaveBeenCalledWith(account);
    expect(mockEnsureProfile).toHaveBeenCalledWith('0xabc');
    expect(mockRetryPending).toHaveBeenCalledWith('0xabc');
  });

  it('skips publishing when the identity is not registered', async () => {
    mockGetRegisteredAt.mockResolvedValueOnce(0);
    await markPublicRecordConsent();
    await selfHealEnrollment(account);
    expect(mockEnsureIdentity).toHaveBeenCalled();
    expect(mockEnsureProfile).not.toHaveBeenCalled();
  });
});
