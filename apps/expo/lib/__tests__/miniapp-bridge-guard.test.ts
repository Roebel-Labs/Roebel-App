import { bridgeGuardScript, createBridgeGuard } from '../miniapp-bridge-guard';

const g = () => createBridgeGuard({ nonce: 'abc', allowedOrigins: () => ['https://app.example'] });
const BRIDGE_MSG = '{"netizen":1,"id":"1","method":"wallet.request"}';

describe('createBridgeGuard', () => {
  it('passes a wrapped message from the app origin', () => {
    expect(
      g().accept({ url: 'https://app.example/x', data: JSON.stringify({ nzf: 'abc', d: '{"netizen":1}' }) }),
    ).toBe('{"netizen":1}');
  });

  it('drops a message whose page is on another origin', () => {
    expect(
      g().accept({ url: 'https://evil.example/', data: JSON.stringify({ nzf: 'abc', d: BRIDGE_MSG }) }),
    ).toBeNull();
    expect(g().accept({ url: 'https://evil.example/', data: BRIDGE_MSG })).toBeNull();
  });

  it('drops a message without a url', () => {
    expect(g().accept({ data: JSON.stringify({ nzf: 'abc', d: BRIDGE_MSG }) })).toBeNull();
    expect(g().accept({ data: BRIDGE_MSG })).toBeNull();
    expect(g().accept({ url: 'not a url', data: BRIDGE_MSG })).toBeNull();
  });

  it('drops an unwrapped message once the envelope was seen', () => {
    const guard = g();
    expect(guard.accept({ url: 'https://app.example/', data: JSON.stringify({ nzf: 'abc', hello: 1 }) })).toBeNull();
    expect(guard.envelopeSeen()).toBe(true);
    expect(guard.accept({ url: 'https://app.example/', data: BRIDGE_MSG })).toBeNull();
  });

  it('drops an envelope with a wrong nonce', () => {
    const guard = g();
    expect(guard.accept({ url: 'https://app.example/', data: JSON.stringify({ nzf: 'xyz', d: BRIDGE_MSG }) })).toBeNull();
    expect(guard.accept({ url: 'https://app.example/', data: JSON.stringify({ nzf: 'xyz', hello: 1 }) })).toBeNull();
    expect(guard.envelopeSeen()).toBe(false);
  });

  it('accepts unwrapped messages only before any envelope was seen', () => {
    const guard = g();
    expect(guard.envelopeSeen()).toBe(false);
    expect(guard.accept({ url: 'https://app.example/', data: BRIDGE_MSG })).toBe(BRIDGE_MSG);
    expect(guard.accept({ url: 'https://app.example/', data: 'not json' })).toBe('not json');
    expect(guard.accept({ url: 'https://app.example/', data: JSON.stringify({ nzf: 'abc', d: 'x' }) })).toBe('x');
    expect(guard.accept({ url: 'https://app.example/', data: BRIDGE_MSG })).toBeNull();
  });

  it('re-reads allowedOrigins on each message (fallback switch)', () => {
    let origins = ['https://app.example'];
    const guard = createBridgeGuard({ nonce: 'abc', allowedOrigins: () => origins });
    origins = ['https://fallback.example'];
    expect(guard.accept({ url: 'https://app.example/', data: BRIDGE_MSG })).toBeNull();
    expect(guard.accept({ url: 'https://fallback.example/mini/x', data: BRIDGE_MSG })).toBe(BRIDGE_MSG);
  });
});

describe('bridgeGuardScript', () => {
  it('the script contains the nonce as a JSON string and ends with true;', () => {
    const s = bridgeGuardScript('ab"c');
    expect(s).toContain(`var n=${JSON.stringify('ab"c')},`);
    expect(s.endsWith('true;')).toBe(true);
  });

  it('the script wraps postMessage', () => {
    const sent: string[] = [];
    const win: any = { ReactNativeWebView: { postMessage: (s: string) => sent.push(s) } };
    new Function('window', bridgeGuardScript('abc'))(win);
    win.ReactNativeWebView.postMessage('hi');
    expect(JSON.parse(sent[0])).toEqual({ nzf: 'abc', hello: 1 });
    expect(JSON.parse(sent[1])).toEqual({ nzf: 'abc', d: 'hi' });
  });

  it('the script still wraps when the native object is assigned later', () => {
    const sent: string[] = [];
    const win: any = {};
    new Function('window', bridgeGuardScript('abc'))(win);
    expect(sent).toHaveLength(0);
    win.ReactNativeWebView = { postMessage: (s: string) => sent.push(s) };
    win.ReactNativeWebView.postMessage('hi');
    expect(JSON.parse(sent[0])).toEqual({ nzf: 'abc', hello: 1 });
    expect(JSON.parse(sent[1])).toEqual({ nzf: 'abc', d: 'hi' });
  });

  it('wrapped output passes through the guard end to end', () => {
    const sent: string[] = [];
    const win: any = { ReactNativeWebView: { postMessage: (s: string) => sent.push(s) } };
    new Function('window', bridgeGuardScript('abc'))(win);
    win.ReactNativeWebView.postMessage(BRIDGE_MSG);
    const guard = g();
    const out = sent.map((data) => guard.accept({ url: 'https://app.example/', data }));
    expect(out).toEqual([null, BRIDGE_MSG]);
  });
});
