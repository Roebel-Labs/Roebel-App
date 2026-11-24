import { orgOverviewMetrics } from '../../components/dashboard/analytics/tiles';
import { ALL_METRICS, type Totals } from '../analytics/queries';

const zero = () => Object.fromEntries(ALL_METRICS.map((m) => [m, { current: 0, previous: 0 }])) as Totals;

describe('orgOverviewMetrics', () => {
  it('gives exactly four numbers in a fixed order', () => {
    expect(orgOverviewMetrics(zero(), zero(), zero()).map((m) => m.label)).toEqual([
      'Beitragsaufrufe',
      'Profilaufrufe',
      'Neue Follower',
      'Interaktionen',
    ]);
  });

  it('sums views + impressions for posts and interactions across kinds', () => {
    const all = zero();
    all.like = { current: 3, previous: 1 };
    all.comment = { current: 2, previous: 1 };
    all.share = { current: 1, previous: 0 };
    all.click = { current: 4, previous: 0 };
    const posts = zero();
    posts.view = { current: 10, previous: 5 };
    posts.impression = { current: 90, previous: 45 };
    const m = orgOverviewMetrics(all, posts, zero());
    expect(m[0]).toEqual({ label: 'Beitragsaufrufe', value: 100, delta: 100 });
    expect(m[3]).toEqual({ label: 'Interaktionen', value: 10, delta: 400 });
  });

  it('shows "neu" (null) when there was nothing before', () => {
    const profile = zero();
    profile.view = { current: 5, previous: 0 };
    expect(orgOverviewMetrics(zero(), zero(), profile)[1].delta).toBeNull();
  });
});
