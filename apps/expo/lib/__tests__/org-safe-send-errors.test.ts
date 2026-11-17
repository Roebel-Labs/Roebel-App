import { classifySendError, isUserRejection } from '../org-safe/send-errors';

describe('classifySendError', () => {
  it('a receipt timeout or a network failure is unknown (possibly sent)', () => {
    expect(classifySendError(new Error('Timeout waiting for userOp to be mined on chain 100 with UserOp hash: 0x' + 'ab'.repeat(32)))).toBe('unknown');
    expect(classifySendError(new Error('timed out waiting for the userOp receipt'))).toBe('unknown');
    expect(classifySendError(new Error('eth_getUserOperationReceipt error: x\nStatus: 500\nCode: UNKNOWN'))).toBe('unknown');
    expect(classifySendError(new TypeError('Network request failed'))).toBe('unknown');
    expect(classifySendError(new Error('HTTP 502'))).toBe('unknown');
    expect(classifySendError('weird')).toBe('unknown');
  });

  it('refusals before submission are not_sent, mined failures reverted, wallet refusals rejected', () => {
    expect(classifySendError(new Error('eth_estimateUserOperationGas error: AA23 reverted'))).toBe('not_sent');
    expect(classifySendError(new Error('eth_sendUserOperation error: {"message":"AA25"}\nStatus: 200'))).toBe('not_sent');
    expect(classifySendError(new Error('Paymaster error from https://x: nope'))).toBe('not_sent');
    expect(classifySendError(new Error('HTTP 403: sponsor refused'))).toBe('not_sent');
    expect(classifySendError(new Error('userOp reverted: boom'))).toBe('reverted');
    expect(classifySendError(Object.assign(new Error('x'), { code: 4001 }))).toBe('rejected');
    expect(classifySendError(new Error('wrapped', { cause: Object.assign(new Error('no'), { name: 'UserRejectedRequestError' }) }))).toBe('rejected');
  });

  it('"cancel" alone is not a user rejection', () => {
    expect(isUserRejection(new Error('operation cancelled by bundler'))).toBe(false);
  });
});
