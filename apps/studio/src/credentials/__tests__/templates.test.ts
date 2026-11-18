import { describe, expect, it } from 'vitest';
import { STUDIO_TEMPLATES, formFromTemplate, typeFormToPayload, validateType, type TypeForm } from '../templates';

const base = (): TypeForm => ({ ...formFromTemplate('mitglied') });

describe('credential type templates', () => {
  it('offers the six server templates with label, kind and description', () => {
    expect(STUDIO_TEMPLATES.map((x) => x.id)).toEqual(['mitglied', 'vorstand', 'mitarbeiter', 'ehrenmitglied', 'stadtvertreter', 'abzeichen']);
    expect(STUDIO_TEMPLATES.find((x) => x.id === 'vorstand')).toMatchObject({ label: 'Vorstand', kind: 'role' });
    expect(STUDIO_TEMPLATES.find((x) => x.id === 'abzeichen')?.kind).toBe('badge');
    for (const x of STUDIO_TEMPLATES) expect(x.description.length).toBeGreaterThan(10);
  });

  it('a valid template form has no errors', () => {
    expect(validateType(base())).toEqual({});
  });

  it('validateType returns the German messages of the dashboard', () => {
    expect(validateType({ ...base(), name: '' })).toEqual({ name: 'Der Name muss 2 bis 60 Zeichen lang sein.' });
    expect(validateType({ ...base(), name: 'x'.repeat(61) })).toEqual({ name: 'Der Name muss 2 bis 60 Zeichen lang sein.' });
    expect(validateType({ ...base(), supplyCap: '0' })).toEqual({ supplyCap: 'Die Höchstzahl muss eine ganze Zahl von 1 bis 100000 sein.' });
    expect(validateType({ ...base(), claimStart: '2026-12-10', claimEnd: '2026-12-01' })).toEqual({ claimEnd: 'Das Ende muss nach dem Beginn liegen.' });
    expect(validateType({ ...base(), description: 'x'.repeat(301) })).toEqual({ description: 'Die Beschreibung darf höchstens 300 Zeichen lang sein.' });
    expect(validateType({ ...base(), benefits: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toEqual({ benefits: 'Höchstens 6 Vorteile mit je bis zu 80 Zeichen.' });
  });

  it('typeFormToPayload: empty cap and dates are 0 / absent; update omits kind', () => {
    const create = typeFormToPayload(base(), 'acc', 'create');
    expect(create).toMatchObject({ accountId: 'acc', op: 'create', template: 'mitglied', name: 'Mitglied', kind: 'membership', supplyCap: 0 });
    expect('claimStart' in create).toBe(false);
    const upd = typeFormToPayload({ ...base(), supplyCap: '50', claimStart: '2026-12-01' }, 'acc', 'update', '0xabc');
    expect(upd).toMatchObject({ op: 'update', typeId: '0xabc', supplyCap: 50, claimStart: '2026-12-01' });
    expect('kind' in upd).toBe(false);
    expect('template' in upd).toBe(false);
  });

  it('an update clears image and dates the admin emptied (server keeps a field that is left out)', () => {
    const upd = typeFormToPayload({ ...base(), imageUrl: null, claimStart: '', claimEnd: '' }, 'acc', 'update', '0xabc');
    expect(upd).toMatchObject({ imageUrl: '', claimStart: '', claimEnd: '' });
  });
});
