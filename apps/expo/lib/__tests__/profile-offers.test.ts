import { prepareProfileOffers, formatOfferPrice } from '../profile-offers';
import type { MarketplaceListingRecord, BusinessDealRecord } from '../types';

const listing = (over: Partial<MarketplaceListingRecord> = {}): MarketplaceListingRecord =>
  ({
    id: 'l1',
    title: 'Fahrrad',
    price: 50,
    price_type: 'fixed',
    listing_type: 'product',
    status: 'active',
    media_urls: [],
    ...over,
  } as MarketplaceListingRecord);

const deal = (over: Partial<BusinessDealRecord> = {}): BusinessDealRecord =>
  ({
    id: 'd1',
    title: '20% Rabatt',
    deal_value: '20%',
    is_active: true,
    status: 'active',
    ...over,
  } as BusinessDealRecord);

describe('prepareProfileOffers', () => {
  test('keeps well-formed listings and reports content', () => {
    const out = prepareProfileOffers([listing()]);
    expect(out.listings).toHaveLength(1);
    expect(out.hasContent).toBe(true);
  });

  test('drops listings missing an id or a string title', () => {
    const out = prepareProfileOffers([
      listing({ id: '' }),
      listing({ title: undefined as unknown as string }),
      listing(),
    ]);
    expect(out.listings).toHaveLength(1);
  });

  test('reports no content when everything is empty or malformed', () => {
    expect(prepareProfileOffers([], []).hasContent).toBe(false);
    expect(prepareProfileOffers([listing({ id: '' })], []).hasContent).toBe(false);
  });

  test('defaults deals to an empty list when omitted', () => {
    expect(prepareProfileOffers([listing()]).deals).toEqual([]);
  });

  test('keeps open deals and reports content even without listings', () => {
    const out = prepareProfileOffers([], [deal()]);
    expect(out.deals).toHaveLength(1);
    expect(out.hasContent).toBe(true);
  });

  test('tolerates null inputs', () => {
    const out = prepareProfileOffers(null, null);
    expect(out.listings).toEqual([]);
    expect(out.deals).toEqual([]);
    expect(out.hasContent).toBe(false);
  });
});

describe('formatOfferPrice', () => {
  test('free listings show Gratis regardless of price', () => {
    expect(formatOfferPrice(0, 'free')).toBe('Gratis');
    expect(formatOfferPrice(null, 'free')).toBe('Gratis');
  });

  test('fixed price is rendered in euros', () => {
    expect(formatOfferPrice(50, 'fixed')).toBe('50 €');
  });

  test('negotiable price adds the VB suffix', () => {
    expect(formatOfferPrice(50, 'negotiable')).toBe('50 € VB');
  });

  test('missing or non-finite price for a non-free type is empty', () => {
    expect(formatOfferPrice(null, 'fixed')).toBe('');
    expect(formatOfferPrice(Number.NaN, 'fixed')).toBe('');
  });
});
