/**
 * Tunable starting constants, not measured truths. Re-derive from anonymised
 * fill-up aggregates once cohort ≥ 30 (spec §13.4).
 */

/** Tier-2 real-world correction on official figures. Spec §5.2. */
export const WLTP_CORRECTION = 1.12;
export const NEDC_CORRECTION = 1.25;
export const WLTP_EV_CORRECTION = 1.15;

/** Road-shape modifiers. Spec §5.3. ICE and EV invert on urban/motorway. */
export const ROAD_SHAPE = {
  ice: { urban: 1.2, rural: 1.0, motorway: 0.95 },
  ev: { urban: 0.85, rural: 1.0, motorway: 1.2 },
} as const;

/**
 * EV temperature derating on battery kWh. Spec §5.5.
 * Applied only when a forecast temperature is supplied.
 */
export const EV_TEMPERATURE_FACTORS: ReadonlyArray<{
  minC: number | null;
  maxC: number | null;
  factor: number;
}> = [
  { minC: 15, maxC: null, factor: 1.0 },
  { minC: 5, maxC: 15, factor: 1.1 },
  { minC: 0, maxC: 5, factor: 1.25 },
  { minC: null, maxC: 0, factor: 1.4 },
];

/** Charging efficiency defaults. Billing is on grid kWh. Spec §5.5. */
export const CHARGING_EFFICIENCY = {
  acHome: 0.88,
  dcRapid: 0.94,
} as const;

export const CLASS_AVERAGE_L_PER_100KM = {
  petrol: 7.5,
  diesel: 6.2,
  hybrid: 5.5,
} as const;

export const CLASS_AVERAGE_KWH_PER_100KM = {
  bev: 18,
  phev: 22,
} as const;
