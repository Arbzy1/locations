/**
 * DEFRA/DESNZ GHG conversion factors 2025 - direct (Scope 1) tailpipe kg CO₂e per litre,
 * 100% mineral fuel (not average biofuel blend), matching spec §5.1 "direct tailpipe".
 *
 * Source: https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025
 * Values: petrol 2.3398 kg/L, diesel 2.6616 kg/L (100% mineral, litres).
 * Starting constants; re-base annually. Never inline these elsewhere.
 */
export const DATASET_YEAR = 2025;

export const PETROL_KG_CO2E_PER_LITRE = 2.3398;
export const DIESEL_KG_CO2E_PER_LITRE = 2.6616;
