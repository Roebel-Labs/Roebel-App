import { describe, expect, it } from 'vitest';
import { AlertQueue, formatEuro } from '../alerts';
import { cfDestinations, srtFullUrl } from '../destinations';
import type { ChatMessage } from '../types';

const msg = (id: string, kind: ChatMessage['kind'], cents: number | null, name: string | null = 'Anna', body = ''): ChatMessage => ({
  id,
  show_id: 's',
  display_name: name,
  avatar_url: null,
  body,
  kind,
  amount_cents: cents,
  created_at: '2026-11-07T18:00:00Z',
  hidden_at: null,
  featured_at: null,
});

describe('formatEuro', () => {
  it('formats German euros', () => {
    expect(formatEuro(500)).toBe('5 €');
    expect(formatEuro(1250)).toBe('12,50 €');
    expect(formatEuro(123456)).toBe('1.234,56 €');
    expect(formatEuro(-3)).toBe('0 €');
  });
});

describe('AlertQueue', () => {
  it('seeds totals without alerting, then queues only new supports once', () => {
    const q = new AlertQueue();
    q.seed([msg('a', 'support', 500), msg('b', 'chat', null)]);
    expect(q.pending()).toEqual([]);
    expect(q.total).toEqual({ cents: 500, count: 1 });
    expect(q.push(msg('a', 'support', 500))).toBe(false);
    expect(q.push(msg('c', 'chat', null))).toBe(false);
    expect(q.push(msg('d', 'support', 1000, null, ' Danke! '))).toBe(true);
    expect(q.push(msg('d', 'support', 1000))).toBe(false);
    expect(q.total).toEqual({ cents: 1500, count: 2 });
    expect(q.shift()).toMatchObject({ id: 'd', name: 'Jemand', amount: '10 €', message: 'Danke!' });
    expect(q.shift()).toBeUndefined();
  });
  it('removes and resets', () => {
    const q = new AlertQueue();
    q.push(msg('x', 'support', 100));
    q.push(msg('y', 'support', 200));
    q.remove('x');
    expect(q.pending().map((a) => a.id)).toEqual(['y']);
    q.reset();
    expect(q.total).toEqual({ cents: 0, count: 0 });
    expect(q.push(msg('x', 'support', 100))).toBe(true);
  });
});

describe('Cloudflare destinations', () => {
  it('builds the full SRT url with encoded stream id', () => {
    expect(srtFullUrl('srt://live.cloudflare.com:778', '#!::r=abc,m=publish', 'ff00')).toBe(
      'srt://live.cloudflare.com:778?streamid=%23!%3A%3Ar%3Dabc%2Cm%3Dpublish&passphrase=ff00',
    );
    expect(srtFullUrl('srt://h:1?x=1', 'id', null)).toBe('srt://h:1?x=1&streamid=id');
  });
  it('maps cf_input_info', () => {
    const d = cfDestinations({
      rtmps_url: 'rtmps://live.cloudflare.com:443/live/',
      stream_key: 'k',
      srt_url: 'srt://live.cloudflare.com:778',
      srt_stream_id: 's',
      srt_passphrase: 'p',
      state: null,
      connected: null,
      hls_url: null,
    });
    expect(d.srt).toEqual({ kind: 'srt', label: 'Röbel App (Cloudflare SRT)', url: 'srt://live.cloudflare.com:778?streamid=s&passphrase=p' });
    expect(d.rtmps).toMatchObject({ kind: 'rtmp', key: 'k' });
  });
});
