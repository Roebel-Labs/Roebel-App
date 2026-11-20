import { redirectSystemPath } from '../../app/+native-intent';
import { redactSecretPath } from '../navigation/redactPath';

describe('credential invite links', () => {
  it('roebel://invite/ausweis/abc and https://www.roebel.app/invite/ausweis/abc both reach /invite/ausweis/abc', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    for (const url of [
      'roebel://invite/ausweis/abc',
      'https://www.roebel.app/invite/ausweis/abc',
      'https://roebel.app/invite/ausweis/abc',
    ]) {
      expect(redirectSystemPath({ path: url, initial: true })).toBe('/invite/ausweis/abc');
    }
    // The token never reaches a log line.
    for (const call of logSpy.mock.calls) expect(call.join(' ')).not.toContain('/abc');
    logSpy.mockRestore();
  });

  it('redacts invite tokens from paths that go to logs or analytics', () => {
    expect(redactSecretPath('/invite/ausweis/s3cr3t-T0ken')).toBe('/invite/ausweis/[token]');
    expect(redactSecretPath('/invite/ausweis/s3cr3t?x=1')).toBe('/invite/ausweis/[token]');
    expect(redactSecretPath('roebel://invite/ausweis/s3cr3t')).toBe('roebel://invite/ausweis/[token]');
    expect(redactSecretPath('/invite/orgtoken')).toBe('/invite/[token]');
    expect(redactSecretPath('/event/123')).toBe('/event/123');
  });
});
