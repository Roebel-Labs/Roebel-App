import { formatRestoreReport } from '../restore-log-format';
import type { RestoreReport } from '../wallet-restore';

const base: RestoreReport = {
  outcome: 'restored',
  attempts: 1,
  errors: [],
  hadStoredSession: true,
  at: '2026-11-20T08:00:00.000Z',
  appVersion: '3.10.0',
  platform: 'ios',
  embeddedLaunch: false,
};

describe('formatRestoreReport', () => {
  it('formats a failed passkey restore after a store update', () => {
    const f = formatRestoreReport({ outcome: 'failed', attempts: 4, errors: ['fetch failed https://rpc.example/?key=SECRET', 'no account restored'], hadStoredSession: true,
      at: '2026-11-20T08:00:00.000Z', appVersion: '3.10.0', platform: 'android', embeddedLaunch: true, owner: 'passkey' });
    expect(f.title).toContain('Passkey');
    expect(f.title).toContain('fehlgeschlagen');
    expect(f.lines).toContain('Store-Version');
    expect(f.lines.join('\n')).not.toContain('SECRET');
  });

  it('labels the three owners and never prints an address', () => {
    expect(formatRestoreReport({ ...base, owner: 'words' }).title).toContain('12 Wörter');
    expect(formatRestoreReport({ ...base, owner: 'thirdweb' }).title).toContain('Google, Apple oder E-Mail');
    expect(formatRestoreReport({ ...base, errors: ['bad 0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5'] }).lines.join(' ')).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it('treats a missing owner as Google, Apple oder E-Mail', () => {
    expect(formatRestoreReport(base).title).toContain('Google, Apple oder E-Mail');
  });

  it('labels every outcome', () => {
    const t = (outcome: RestoreReport['outcome']) => formatRestoreReport({ ...base, outcome }).title;
    expect(t('restored')).toMatch(/· wiederhergestellt$/);
    expect(t('restored-late')).toContain('später wiederhergestellt');
    expect(t('failed')).toContain('fehlgeschlagen');
    expect(t('no-session')).toContain('keine Anmeldung gespeichert');
    expect(t('cancelled')).toContain('abgebrochen');
  });

  it('shows version, launch kind and attempts; an OTA launch reads as Update', () => {
    const f = formatRestoreReport({ ...base, attempts: 2 });
    expect(f.title.startsWith(new Date(base.at).toLocaleString('de-DE'))).toBe(true);
    expect(f.lines.some((l) => l.includes('3.10.0'))).toBe(true);
    expect(f.lines).toContain('Update');
    expect(f.lines.some((l) => l.includes('2'))).toBe(true);
  });

  it('cuts error messages to 120 characters and strips query strings', () => {
    const f = formatRestoreReport({ ...base, errors: ['x'.repeat(300), 'call https://a.example/path?token=abc&x=1 failed'] });
    const errs = f.lines.slice(-2);
    expect(errs[0].length).toBeLessThanOrEqual(120);
    expect(errs[1]).not.toContain('token');
    expect(errs[1]).not.toContain('abc');
    expect(errs[1]).toContain('failed');
  });

  it('survives a malformed stored entry', () => {
    const f = formatRestoreReport({ outcome: 'failed' } as unknown as RestoreReport);
    expect(f.title).toContain('fehlgeschlagen');
    expect(Array.isArray(f.lines)).toBe(true);
  });
});
