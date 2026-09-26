import { MAX_CHAT_TRANSFER, planMuenzenTransfer, transferErrorMessage } from '../transfer';
import type { ChatPart } from '../types';

type ApprovalPart = Extract<ChatPart, { type: 'approval' }>;

// Same semantics as lib/roebel-taler parseTalerAmount (kept local: that module pulls in thirdweb).
const parse = (input: string): bigint => {
  const clean = input.replace(',', '.').trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return 0n;
  const [whole, frac = ''] = clean.split('.');
  return BigInt(whole || '0') * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18) || '0');
};

const card = (signRequest?: ApprovalPart['signRequest']): ApprovalPart => ({
  type: 'approval',
  actionId: 'a1',
  tool: 'transfer_muenzen',
  risk: 'money',
  title: 'Freigabe',
  summary: '5 Röbel Münzen an Anna senden',
  preview: { kind: 'transfer', fields: [] },
  status: 'pending',
  canAlwaysAllow: false,
  signRequest,
});

const wallet = '0x' + 'ab'.repeat(20);

describe('planMuenzenTransfer', () => {
  it('parses a German amount', () => {
    const plan = planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'Anna', amount: '2,5', toWallet: wallet }), parse);
    expect(plan).toEqual({ ok: true, to: wallet, amount: 25n * 10n ** 17n, toName: 'Anna', amountLabel: '2,5' });
  });
  it('rejects a missing or malformed wallet', () => {
    expect(planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'Anna', amount: '5' }), parse).ok).toBe(false);
    expect(planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'Anna', amount: '5', toWallet: '0x12' }), parse).ok).toBe(false);
    expect(planMuenzenTransfer(card(undefined), parse).ok).toBe(false);
  });
  it('rejects zero, above the cap and above the balance', () => {
    expect(planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'A', amount: '0', toWallet: wallet }), parse).ok).toBe(false);
    expect(planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'A', amount: '100,01', toWallet: wallet }), parse).ok).toBe(false);
    expect(planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'A', amount: '100', toWallet: wallet }), parse).ok).toBe(true);
    const low = planMuenzenTransfer(card({ kind: 'muenzen_transfer', toName: 'A', amount: '5', toWallet: wallet }), parse, 10n ** 18n);
    expect(low).toEqual({ ok: false, error: 'Nicht genug Röbel Münzen.' });
    expect(MAX_CHAT_TRANSFER).toBe(100n * 10n ** 18n);
  });
});

describe('transferErrorMessage', () => {
  it('maps errors to German text without addresses', () => {
    expect(transferErrorMessage(new Error('User rejected the request'))).toBe('Auf dem Gerät abgebrochen.');
    expect(transferErrorMessage(new Error(`revert from ${wallet}`))).toBe('Die Überweisung ist fehlgeschlagen.');
    expect(transferErrorMessage(null)).not.toMatch(/0x/);
  });
});
