/**
 * CSPRNG bytes. In the app `index.js` installs `react-native-get-random-values`
 * (backs `crypto.getRandomValues`); under jest/node the global webcrypto serves it.
 * Never falls back to Math.random.
 */
export function randomBytes(n: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) throw new Error('crypto.getRandomValues is not available');
  const out = new Uint8Array(n);
  c.getRandomValues(out);
  return out;
}
