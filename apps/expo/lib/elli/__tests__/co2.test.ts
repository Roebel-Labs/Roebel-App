import {
  CO2_FACTORS,
  co2SavedGrams,
  dieselGramsPerKm,
  elliGramsPerKm,
  equivalents,
  formatCo2,
  totalsFromRides,
} from '../co2';

describe('Elli CO2 factors', () => {
  it('diesel car ≈ 206 g/km (6.5 l/100 km × 3.17 kg/l well-to-wheel)', () => {
    expect(dieselGramsPerKm()).toBeCloseTo(206.05, 1);
  });
  it('Elli on green power ≈ 6.6 g/km (22 kWh/100 km × 30 g/kWh)', () => {
    expect(elliGramsPerKm()).toBeCloseTo(6.6, 5);
  });
});

describe('co2SavedGrams', () => {
  it('counts each passenger as one diesel car not driven, minus all Elli km incl. the empty drive', () => {
    // 8 km ride, 1 passenger, 6 km empty: 8 × 206.05 − 14 × 6.6
    expect(co2SavedGrams({ rideKm: 8, emptyKm: 6, passengers: 1 })).toBeCloseTo(1556, 0);
  });
  it('scales with passengers', () => {
    expect(co2SavedGrams({ rideKm: 8, emptyKm: 6, passengers: 2 })).toBeCloseTo(3204.4, 0);
  });
  it('never goes negative and treats bad input as zero', () => {
    expect(co2SavedGrams({ rideKm: 0, emptyKm: 50, passengers: 1 })).toBe(0);
    expect(co2SavedGrams({ rideKm: -3, emptyKm: NaN, passengers: 0 })).toBe(0);
  });
});

describe('totalsFromRides', () => {
  it('sums rides, passenger-km and saving', () => {
    const t = totalsFromRides([
      { rideKm: 8, emptyKm: 6, passengers: 1 },
      { rideKm: 8, emptyKm: 6, passengers: 2 },
    ]);
    expect(t.rides).toBe(2);
    expect(t.passengers).toBe(3);
    expect(t.passengerKm).toBe(24);
    expect(t.savedGrams).toBeCloseTo(4760.5, 0);
  });
  it('is all zero for no rides', () => {
    expect(totalsFromRides([])).toEqual({ rides: 0, passengers: 0, passengerKm: 0, vehicleKm: 0, savedGrams: 0 });
  });
});

describe('formatCo2', () => {
  it('uses g below 1 kg and kg (one decimal, German comma) above', () => {
    expect(formatCo2(0)).toBe('0 g');
    expect(formatCo2(412.6)).toBe('413 g');
    expect(formatCo2(1556)).toBe('1,6 kg');
    expect(formatCo2(25400)).toBe('25 kg');
    expect(formatCo2(2_340_000)).toBe('2,3 t');
  });
});

describe('equivalents', () => {
  it('translates 10 kg into diesel litres, diesel km, phone charges and forest area', () => {
    const e = equivalents(10_000);
    expect(e.map((x) => x.key)).toEqual(['diesel', 'km', 'phone', 'forest']);
    expect(e[0].value).toBeCloseTo(10 / CO2_FACTORS.dieselKgPerLitre, 3);
    expect(e[1].value).toBeCloseTo(10_000 / dieselGramsPerKm(), 3);
  });
});
