import { MEMBER_LIST_PHONE_LIMIT, MEMBER_LIST_MORE, defaultRenewDate, memberRows, memberStateLabel, parseGermanDate, phoneList } from '../members-view';
import { TYPE_TEMPLATES, templatePayload } from '../templates';
import { assertCleanCopy } from '../copy';
import type { PersonRow } from '../types';

const row = (n: number, over: Partial<PersonRow> = {}): PersonRow => ({
  id: `p${n}`,
  displayName: `Person ${n}`,
  state: 'angenommen',
  public: false,
  validUntil: null,
  hasLink: false,
  ...over,
});

describe('members view', () => {
  it('filters by state and by name', () => {
    const people = [
      row(1, { displayName: 'Anna Alt' }),
      row(2, { displayName: 'Bernd Bau', state: 'eingeladen' }),
      row(3, { displayName: 'Carla Cord', state: 'abgelaufen' }),
      row(4, { displayName: 'Dora Dorn', state: 'widerrufen' }),
      row(5, { displayName: 'Anke Amsel', state: 'abgelehnt' }),
    ];
    expect(memberRows(people, 'alle', '').map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(memberRows(people, 'eingeladen', '').map((r) => r.id)).toEqual(['p2']);
    expect(memberRows(people, 'angenommen', '').map((r) => r.id)).toEqual(['p1']);
    expect(memberRows(people, 'abgelaufen', '').map((r) => r.id)).toEqual(['p3']);
    expect(memberRows(people, 'widerrufen', '').map((r) => r.id)).toEqual(['p4']);
    expect(memberRows(people, 'alle', '  an ').map((r) => r.id)).toEqual(['p1', 'p5']);
    expect(memberRows(people, 'angenommen', 'ANNA').map((r) => r.id)).toEqual(['p1']);
  });

  it('caps the phone list at 100 and says where the full list is', () => {
    const people = Array.from({ length: 130 }, (_, k) => row(k));
    const capped = phoneList(people);
    expect(MEMBER_LIST_PHONE_LIMIT).toBe(100);
    expect(capped.rows).toHaveLength(100);
    expect(capped.more).toBe(MEMBER_LIST_MORE);
    expect(MEMBER_LIST_MORE).toBe('Für große Listen: roebel.app/dashboard/credentials');
    expect(phoneList(people.slice(0, 100))).toEqual({ rows: people.slice(0, 100), more: null });
  });

  it('never labels a member private', () => {
    const labels = (['eingeladen', 'angenommen', 'abgelehnt', 'widerrufen', 'abgelaufen'] as const).flatMap((state) => [
      memberStateLabel(row(1, { state, public: false })),
      memberStateLabel(row(1, { state, public: true })),
    ]);
    for (const l of labels) expect(l).not.toMatch(/privat/i);
    expect(memberStateLabel(row(1, { public: true }))).toBe('Angenommen · Öffentlich');
    expect(memberStateLabel(row(1, { public: false }))).toBe('Angenommen');
    expect(assertCleanCopy(labels)).toEqual([]);
  });

  it('templates match the dashboard and become a type_prepare create payload', () => {
    expect(Object.keys(TYPE_TEMPLATES)).toEqual(['mitglied', 'vorstand', 'mitarbeiter', 'ehrenmitglied', 'stadtvertreter', 'abzeichen']);
    expect(templatePayload('vorstand', { name: ' Vorstand 2027 ' })).toEqual({
      op: 'create',
      template: 'vorstand',
      kind: 'role',
      name: 'Vorstand 2027',
      description: 'Bestätigt ein Amt im Vorstand der Organisation.',
      benefits: [],
      supplyCap: 0,
    });
  });

  it('renew date: German input to YYYY-MM-DD, default end of next year, nonsense refused', () => {
    expect(parseGermanDate('31.12.2027')).toBe('2027-12-31');
    expect(parseGermanDate(' 1.2.2028 ')).toBe('2028-02-01');
    expect(parseGermanDate('31.02.2028')).toBeNull();
    expect(parseGermanDate('morgen')).toBeNull();
    expect(defaultRenewDate(new Date('2026-11-18T10:00:00Z'))).toBe('31.12.2027');
  });
});
