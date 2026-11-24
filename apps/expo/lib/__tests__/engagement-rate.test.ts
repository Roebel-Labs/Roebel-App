import { engagementRate } from '../../components/dashboard/analytics/tiles';
describe('engagementRate', () => {
  it('shows a dash without views', () => expect(engagementRate(5, 0)).toBe('–'));
  it('formats German percent with one decimal', () => expect(engagementRate(1, 8)).toBe('12,5 %'));
});
