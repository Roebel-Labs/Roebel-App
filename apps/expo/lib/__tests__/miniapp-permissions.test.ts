import { previewBannerText } from '../miniapp-permissions';

describe('previewBannerText', () => {
  it('lists the simulated permissions by their German label', () => {
    expect(previewBannerText(['wallet', 'share'])).toBe(
      'Vorschau · simuliert: Wallet & Signaturen, Teilen',
    );
  });
  it('says so when nothing is simulated', () => {
    expect(previewBannerText([])).toBe('Vorschau · keine Berechtigungen simuliert');
  });
});
