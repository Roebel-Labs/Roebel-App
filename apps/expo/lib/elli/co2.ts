// Elli CO₂ savings — one place for the method, the factors and their sources.
//
// Method (agreed with Max 2026-11-22):
// - Baseline: every passenger would otherwise have driven their own diesel car
//   the same distance alone.
// - Elli is a Nissan e-NV200 charged with green electricity (assumption until
//   the Bürgerbusverein confirms its tariff).
// - Elli's empty drive to the pickup counts against the saving.
//
//   saved = passengers × rideKm × diesel g/km − (rideKm + emptyKm) × Elli g/km
//
// The explainer screen (app/elli/co2-info.tsx) renders CO2_FACTORS and
// CO2_SOURCES, so changing a value here changes the published method too.

export const CO2_FACTORS = {
  /** Everyday consumption of an average diesel car (l/100 km). */
  dieselLitresPer100Km: 6.5,
  /** CO₂e per litre diesel incl. fuel production (well-to-wheel, kg). */
  dieselKgPerLitre: 3.17,
  /** Real-world consumption of the e-NV200 incl. charging losses (kWh/100 km). */
  elliKwhPer100Km: 22,
  /** Life-cycle emissions of green electricity (wind/solar, g CO₂e/kWh). */
  greenPowerGramsPerKwh: 30,
  /** German grid mix, used only for the phone-charge comparison (g/kWh). */
  gridGramsPerKwh: 363,
  /** Energy for one full smartphone charge (kWh). */
  phoneChargeKwh: 0.015,
  /** CO₂ a square metre of forest binds per year (kg). */
  forestKgPerM2Year: 0.2,
} as const;

export const CO2_SOURCES: { label: string; detail: string }[] = [
  {
    label: 'Diesel-Pkw',
    detail: '6,5 l/100 km Alltagsverbrauch, 3,17 kg CO₂e je Liter inkl. Kraftstoffherstellung (Umweltbundesamt, ProBas).',
  },
  {
    label: 'Elli (Nissan e-NV200)',
    detail: '22 kWh/100 km inkl. Ladeverluste. Annahme: Ökostrom mit 30 g CO₂e/kWh über den Lebenszyklus von Wind- und Solaranlagen.',
  },
  {
    label: 'Strommix Deutschland',
    detail: '363 g CO₂/kWh (Umweltbundesamt, 2024) — nur für den Vergleich mit Handy-Ladungen.',
  },
  {
    label: 'Wald',
    detail: 'Rund 0,2 kg CO₂ je m² und Jahr — grober Mittelwert, echte Wälder schwanken stark.',
  },
];

export type RideInput = { rideKm: number; emptyKm: number; passengers: number };

const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function dieselGramsPerKm(): number {
  return (CO2_FACTORS.dieselLitresPer100Km / 100) * CO2_FACTORS.dieselKgPerLitre * 1000;
}

export function elliGramsPerKm(): number {
  return (CO2_FACTORS.elliKwhPer100Km / 100) * CO2_FACTORS.greenPowerGramsPerKwh;
}

export function co2SavedGrams({ rideKm, emptyKm, passengers }: RideInput): number {
  const ride = clean(rideKm);
  const avoided = Math.floor(clean(passengers)) * ride * dieselGramsPerKm();
  const caused = (ride + clean(emptyKm)) * elliGramsPerKm();
  return Math.max(0, avoided - caused);
}

export type Co2Totals = {
  rides: number;
  passengers: number;
  passengerKm: number;
  vehicleKm: number;
  savedGrams: number;
};

export function totalsFromRides(rides: RideInput[]): Co2Totals {
  return rides.reduce<Co2Totals>(
    (t, r) => ({
      rides: t.rides + 1,
      passengers: t.passengers + Math.floor(clean(r.passengers)),
      passengerKm: t.passengerKm + Math.floor(clean(r.passengers)) * clean(r.rideKm),
      vehicleKm: t.vehicleKm + clean(r.rideKm) + clean(r.emptyKm),
      savedGrams: t.savedGrams + co2SavedGrams(r),
    }),
    { rides: 0, passengers: 0, passengerKm: 0, vehicleKm: 0, savedGrams: 0 },
  );
}

const de = (n: number, digits: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });

/** "413 g", "1,6 kg", "25 kg", "2,3 t" */
export function formatCo2(grams: number): string {
  const g = clean(grams);
  if (g < 1000) return `${Math.round(g)} g`;
  if (g < 10_000) return `${de(g / 1000, 1)} kg`;
  if (g < 1_000_000) return `${Math.round(g / 1000)} kg`;
  return `${de(g / 1_000_000, 1)} t`;
}

export type Equivalent = { key: 'diesel' | 'km' | 'phone' | 'forest'; value: number; unit: string; label: string };

export function equivalents(grams: number): Equivalent[] {
  const g = clean(grams);
  const f = CO2_FACTORS;
  return [
    { key: 'diesel', value: g / 1000 / f.dieselKgPerLitre, unit: 'l', label: 'Diesel, die nicht verbrannt wurden' },
    { key: 'km', value: g / dieselGramsPerKm(), unit: 'km', label: 'mit einem Diesel-Auto gefahren' },
    { key: 'phone', value: g / (f.phoneChargeKwh * f.gridGramsPerKwh), unit: '×', label: 'Handy voll aufgeladen' },
    { key: 'forest', value: g / 1000 / f.forestKgPerM2Year, unit: 'm²', label: 'Wald, der ein Jahr lang CO₂ bindet' },
  ];
}

export function formatEquivalent(e: Equivalent): string {
  const digits = e.value < 10 ? 1 : 0;
  return e.unit === '×' ? `${de(e.value, 0)}×` : `${de(e.value, digits)} ${e.unit}`;
}
