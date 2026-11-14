import { afterEach, describe, expect, it } from 'vitest';
import { getLang, locale, parseLang, setLang, t, translatedKeys } from '../index';

afterEach(() => setLang('de'));

describe('i18n', () => {
  it('German is the default and needs no dictionary', () => {
    expect(getLang()).toBe('de');
    expect(parseLang('fr')).toBe('de');
    expect(t('Briefing anhören')).toBe('Briefing anhören');
    expect(locale()).toBe('de-DE');
  });

  it('English looks the German text up and fills placeholders', () => {
    setLang('en');
    expect(t('Briefing anhören')).toBe('Listen to briefing');
    expect(t('Routine eingerichtet: {title}', { title: 'Inbox' })).toBe('Routine set up: Inbox');
    expect(locale()).toBe('en-GB');
  });

  it('a missing translation falls back to German, never to nothing', () => {
    setLang('en');
    expect(t('Gibt es nicht im Wörterbuch {n}', { n: 3 })).toBe('Gibt es nicht im Wörterbuch 3');
  });

  it('every English entry keeps the placeholders of its German key', () => {
    setLang('en');
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const de of translatedKeys()) expect(names(t(de)), de).toBe(names(de));
  });
});
