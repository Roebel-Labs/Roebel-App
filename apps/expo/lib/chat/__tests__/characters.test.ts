import fs from 'fs';
import path from 'path';
import {
  AGENT_CHARACTERS,
  agentShareUrl,
  characterArt,
  characterById,
  characterRoleLine,
  shuffleCharacter,
} from '../characters';

describe('agent characters', () => {
  it('has twelve characters with unique ids and hex colours', () => {
    expect(AGENT_CHARACTERS).toHaveLength(12);
    expect(new Set(AGENT_CHARACTERS.map((c) => c.id)).size).toBe(12);
    for (const c of AGENT_CHARACTERS) expect(c.color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('stays in sync with the server catalogue', () => {
    const file = path.resolve(__dirname, '../../../../web/src/lib/chat/agent/characters.ts');
    if (!fs.existsSync(file)) return; // the app can be checked out without the website
    const src = fs.readFileSync(file, 'utf8');
    const rows = [...src.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", species: "([^"]+)", feminine: (true|false), role: "([^"]+)", tagline: "([^"]+)", personality: "([^"]+)", color: "([^"]+)" \}/g)];
    expect(rows).toHaveLength(AGENT_CHARACTERS.length);
    const server = rows.map((m) => ({
      id: m[1], name: m[2], species: m[3], feminine: m[4] === 'true', role: m[5], tagline: m[6], personality: m[7], color: m[8],
    }));
    expect(AGENT_CHARACTERS).toEqual(server);
  });

  it('looks up by id and rejects everything else', () => {
    expect(characterById('otto')?.name).toBe('Otto');
    expect(characterById('berta')).toBeNull();
    expect(characterById(undefined)).toBeNull();
    expect(characterById(7)).toBeNull();
    expect(characterById('')).toBeNull();
  });

  it('builds the role line by gender', () => {
    expect(characterRoleLine({ feminine: true, role: 'Termine und Kalender' })).toBe('Agentin für Termine und Kalender');
    expect(characterRoleLine({ feminine: false, role: 'Archiv und Gedächtnis' })).toBe('Agent für Archiv und Gedächtnis');
  });

  it('points the artwork at the website', () => {
    expect(characterArt('otto')).toEqual({
      full: 'https://www.roebel.app/agents/otto/full.webp',
      tile: 'https://www.roebel.app/agents/otto/mail.png',
      card: 'https://www.roebel.app/agents/otto/card.png',
    });
  });

  it('builds the share link, with the name only when it differs', () => {
    const otto = { id: 'otto', name: 'Otto' };
    expect(agentShareUrl(otto, 'Otto')).toBe('https://www.roebel.app/ortis/agent/otto');
    expect(agentShareUrl(otto, '  ')).toBe('https://www.roebel.app/ortis/agent/otto');
    expect(agentShareUrl(otto, 'Käpt’n Öl & Co')).toBe(
      `https://www.roebel.app/ortis/agent/otto?name=${encodeURIComponent('Käpt’n Öl & Co')}`,
    );
  });

  it('shuffles to another character', () => {
    expect(shuffleCharacter('wolke', 0).id).toBe('pilzi');
    expect(shuffleCharacter('klaas', 0.999).id).toBe('mari');
    expect(shuffleCharacter(null, 0).id).toBe('wolke');
    for (let i = 0; i < 20; i++) expect(shuffleCharacter('otto').id).not.toBe('otto');
  });
});
