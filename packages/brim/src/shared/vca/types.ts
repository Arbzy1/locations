import { z } from "zod";
import {
  consumptionUnitSchema,
  propulsionSchema,
  testCycleSchema,
} from "../types.js";

export const vcaVehicleSchema = z.object({
  id: z.string(),
  make: z.string(),
  model: z.string(),
  derivative: z.string().optional(),
  fuel: propulsionSchema,
  engineCc: z.number().int().optional(),
  transmission: z.string().optional(),
  co2Gkm: z.number().int().optional(),
  consumptionCombined: z.number(),
  unit: consumptionUnitSchema,
  cycle: testCycleSchema,
  datasetVersion: z.string(),
});
export type VcaVehicle = z.infer<typeof vcaVehicleSchema>;

/** Catalogue hit shaped for the estimate / save-vehicle path. */
export const catalogueVehicleSchema = z.object({
  id: z.string(),
  make: z.string(),
  model: z.string(),
  derivative: z.string().optional(),
  propulsion: propulsionSchema,
  transmission: z.string().optional(),
  engineCc: z.number().int().optional(),
  co2Gkm: z.number().int().optional(),
  officialConsumption: z.number(),
  officialUnit: consumptionUnitSchema,
  officialCycle: testCycleSchema,
});
export type CatalogueVehicle = z.infer<typeof catalogueVehicleSchema>;

export type NormaliseSkip = { reason: string; make?: string; model?: string };

export type NormaliseResult = {
  vehicles: VcaVehicle[];
  skipped: NormaliseSkip[];
};
