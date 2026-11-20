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

  it('a thirdweb eth_sendUserOperation error counts as not_sent only with Status 200 or 4xx', () => {
    expect(classifySendError(new Error('eth_sendUserOperation error: x\nStatus: 503\nCode: UNKNOWN'))).toBe('unknown');
    expect(classifySendError(new Error('eth_sendUserOperation error: x\nStatus: 500'))).toBe('unknown');
    expect(classifySendError(new Error('eth_sendUserOperation error: AA25 invalid nonce\nStatus: 502'))).toBe('unknown');
    expect(classifySendError(new Error('eth_sendUserOperation error: x\nStatus: 200\nCode: UNKNOWN'))).toBe('not_sent');
    expect(classifySendError(new Error('eth_sendUserOperation error: x\nStatus: 400'))).toBe('not_sent');
    expect(classifySendError(new Error('eth_sendUserOperation error: x'))).toBe('unknown');
    expect(classifySendError(new Error('wrapped', { cause: new Error('eth_sendUserOperation error: x\nStatus: 504') }))).toBe('unknown');
    // passkey JSON-RPC refusal and pre-submission calls stay not_sent whatever the status
    expect(classifySendError(new Error('eth_sendUserOperation: AA25 invalid nonce'))).toBe('not_sent');
    expect(classifySendError(new Error('eth_estimateUserOperationGas error: x\nStatus: 503'))).toBe('not_sent');
  });

  it('"cancel" alone is not a user rejection', () => {
    expect(isUserRejection(new Error('operation cancelled by bundler'))).toBe(false);
  });
});
