// Reads the Elli ride log (supabase/migrations/20261122_elli_rides_co2.sql)
// and turns it into CO₂ figures with the factors in ./co2.
import { supabase } from '@/lib/supabase';
import { co2SavedGrams, dieselGramsPerKm, elliGramsPerKm, totalsFromRides, type Co2Totals } from './co2';

export type ElliRide = {
  id: string;
  completedAt: string;
  passengers: number;
  rideKm: number;
  emptyKm: number;
  savedGrams: number;
};

export type PilotTotals = Co2Totals & { since: string | null };

const EMPTY: Co2Totals = { rides: 0, passengers: 0, passengerKm: 0, vehicleKm: 0, savedGrams: 0 };

/** A rider's own rides; empty when signed out, offline or before the migration. */
export async function fetchMyElliRides(wallet: string | null | undefined): Promise<{ rides: ElliRide[]; totals: Co2Totals }> {
  if (!wallet) return { rides: [], totals: EMPTY };
  const { data, error } = await supabase.rpc('elli_my_rides', { p_wallet: wallet });
  if (error || !Array.isArray(data)) return { rides: [], totals: EMPTY };
  const rides = data.map((r: any) => {
    const input = { rideKm: Number(r.ride_km), emptyKm: Number(r.empty_km), passengers: Number(r.passengers) };
    return { id: r.id, completedAt: r.completed_at, ...input, savedGrams: co2SavedGrams(input) };
  });
  return { rides, totals: totalsFromRides(rides) };
}

/** Town-wide totals for the pilot (LandStation report). */
export async function fetchPilotTotals(): Promise<PilotTotals> {
  const { data, error } = await supabase.rpc('elli_pilot_totals');
  const row = !error && Array.isArray(data) ? data[0] : null;
  if (!row) return { ...EMPTY, since: null };
  const passengerKm = Number(row.passenger_km) || 0;
  const vehicleKm = Number(row.vehicle_km) || 0;
  return {
    rides: Number(row.rides) || 0,
    passengers: Number(row.passengers) || 0,
    passengerKm,
    vehicleKm,
    // Same formula as per ride, summed (linear) — per-ride rounding at 0 aside.
    savedGrams: Math.max(0, passengerKm * dieselGramsPerKm() - vehicleKm * elliGramsPerKm()),
    since: row.since ?? null,
  };
}
