const mockSendTransaction = jest.fn();
const mockWaitForReceipt = jest.fn();
jest.mock('thirdweb', () => ({
  prepareTransaction: (tx: unknown) => tx,
  sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  sendBatchTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  waitForReceipt: (...args: unknown[]) => mockWaitForReceipt(...args),
}));
jest.mock('@/constants/thirdweb', () => ({ client: {} }));
jest.mock('@/constants/gnosis', () => ({ gnosis: { id: 100 } }));

import { sendOrgCalls, sendOrgCallsKeepingHash } from '../org-safe/send';

const TX = ('0x' + 'ee'.repeat(32)) as `0x${string}`;
const account = { address: '0x' + 'ab'.repeat(20) } as any;
const call = { to: ('0x' + '11'.repeat(20)) as `0x${string}`, data: '0x01' as `0x${string}` };

beforeEach(() => {
  mockSendTransaction.mockReset();
  mockWaitForReceipt.mockReset();
});

describe('org-safe send', () => {
  it('sendOrgCalls keeps its behaviour: receipt hash, and a failed receipt wait throws', async () => {
    mockSendTransaction.mockResolvedValue({ transactionHash: TX });
    mockWaitForReceipt.mockResolvedValue({ transactionHash: TX });
    await expect(sendOrgCalls(account, [call])).resolves.toBe(TX);
    mockWaitForReceipt.mockRejectedValue(new Error('timeout'));
    await expect(sendOrgCalls(account, [call])).rejects.toThrow('timeout');
  });

  it('sendOrgCallsKeepingHash returns the hash when the receipt wait fails after sending', async () => {
    mockSendTransaction.mockResolvedValue({ transactionHash: TX });
    mockWaitForReceipt.mockRejectedValue(new Error('timeout'));
    await expect(sendOrgCallsKeepingHash(account, [call, call])).resolves.toEqual({ txHash: TX, confirmed: false });
    mockWaitForReceipt.mockResolvedValue({ transactionHash: TX });
    await expect(sendOrgCallsKeepingHash(account, [call])).resolves.toEqual({ txHash: TX, confirmed: true });
  });

  it('sendOrgCallsKeepingHash throws when nothing was sent', async () => {
    mockSendTransaction.mockRejectedValue(new Error('rejected'));
    await expect(sendOrgCallsKeepingHash(account, [call])).rejects.toThrow();
    expect(mockWaitForReceipt).not.toHaveBeenCalled();
  });
});
