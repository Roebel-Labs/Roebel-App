jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { formatCents, parseTicketPayload, orderStatusLabel, isTicketPayload } from '../tickets';

describe('tickets helpers', () => {
  it('formats cents in German', () => {
    expect(formatCents(0)).toBe('Kostenlos');
    expect(formatCents(1250)).toBe('12,50 €');
    expect(formatCents(500)).toBe('5 €');
  });
  it('recognises ticket payloads by shape only', () => {
    expect(parseTicketPayload('roebel-ticket:v1:ABCDEFGHJK:0123456789abcdef')).toEqual({ code: 'ABCDEFGHJK' });
    expect(parseTicketPayload('roebel-card:v2:x')).toBeNull();
    expect(isTicketPayload('roebel-ticket:v1:ABCDEFGHJK:0123456789abcdef')).toBe(true);
  });
  it('labels order states', () => {
    expect(orderStatusLabel('pending')).toBe('Zahlung offen');
    expect(orderStatusLabel('paid')).toBe('Bezahlt');
    expect(orderStatusLabel('refunded')).toBe('Erstattet');
  });
});
