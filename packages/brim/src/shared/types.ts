import { z } from "zod";

export const propulsionSchema = z.enum(["petrol", "diesel", "hybrid", "phev", "bev"]);
export type Propulsion = z.infer<typeof propulsionSchema>;

export const vehicleKindSchema = z.enum(["car", "van", "motorcycle"]);
export type VehicleKind = z.infer<typeof vehicleKindSchema>;

export const consumptionUnitSchema = z.enum(["l/100km", "kWh/100km", "mpg", "mi/kWh"]);
export type ConsumptionUnit = z.infer<typeof consumptionUnitSchema>;

export const consumptionTierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type ConsumptionTier = z.infer<typeof consumptionTierSchema>;

export const testCycleSchema = z.enum(["WLTP", "NEDC"]);
export type TestCycle = z.infer<typeof testCycleSchema>;

export const bandSchema = z.object({
  point: z.number(),
  low: z.number(),
  high: z.number(),
});
export type Band = z.infer<typeof bandSchema>;

export const chargeKindSchema = z.enum(["toll", "zone_charge", "restriction"]);
export type ChargeKind = z.infer<typeof chargeKindSchema>;

export const chargeSchema = z.object({
  id: z.string(),
  kind: chargeKindSchema,
  name: z.string(),
  pence: z.number(),
  operatorUrl: z.string().optional(),
  note: z.string().optional(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warning", "blocking"]),
});
export type Warning = z.infer<typeof warningSchema>;

export const priceSourceSchema = z.enum([
  "user-picked-station",
  "cheapest-on-route",
  "home-area-median",
  "national-median",
  "hardcoded-fallback",
  "user-tariff",
  "network-table",
]);
export type PriceSource = z.infer<typeof priceSourceSchema>;

export const vehicleProfileSchema = z.object({
  kind: vehicleKindSchema.default("car"),
  propulsion: propulsionSchema,
  make: z.string().optional(),
  model: z.string().optional(),
  derivative: z.string().optional(),
  vcaMatchId: z.string().optional(),
  year: z.number().int().optional(),
  officialConsumption: z.number().optional(),
  officialUnit: consumptionUnitSchema.optional(),
  officialCycle: testCycleSchema.optional(),
  userEnteredConsumption: z.number().optional(),
  userEnteredUnit: consumptionUnitSchema.optional(),
  tankLitres: z.number().optional(),
  batteryKwhUsable: z.number().optional(),
  hasHeatPump: z.boolean().optional(),
  euroStatus: z.string().optional(),
  euroStatusSource: z.enum(["dvla", "derived"]).optional(),
  startChargePercent: z.number().optional(),
});
export type VehicleProfile = z.infer<typeof vehicleProfileSchema>;

export const vehicleSchema = vehicleProfileSchema.extend({
  id: z.string(),
  nickname: z.string().optional(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const calibrationSchema = z.object({
  value: z.number(),
  unit: consumptionUnitSchema,
  sampleCount: z.number().int(),
});
export type Calibration = z.infer<typeof calibrationSchema>;

export const estimateSchema = z.object({
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  energy: z.object({
    kind: z.enum(["liquid", "electric"]),
    litres: bandSchema.optional(),
    kwh: z
      .object({
        battery: z.number(),
        grid: z.number(),
        low: z.number(),
        high: z.number(),
      })
      .optional(),
    arrivalStateOfCharge: z
      .object({
        percent: z.number(),
        verdict: z.enum(["comfortable", "tight", "insufficient"]),
        shortfallKwh: z.number().optional(),
      })
      .optional(),
  }),
  cost: z.object({
    energyPence: bandSchema,
    chargesPence: z.number(),
    totalPence: bandSchema,
  }),
  charges: z.array(chargeSchema),
  co2Kg: z.number(),
  consumption: z.object({
    value: z.number(),
    unit: z.enum(["l/100km", "kWh/100km"]),
    display: z.string(),
    tier: consumptionTierSchema,
    label: z.string(),
  }),
  price: z.object({
    pence: z.number(),
    unit: z.enum(["ppl", "p/kWh"]),
    source: priceSourceSchema,
    stationId: z.string().optional(),
    observedAt: z.string(),
  }),
  hmrc: z
    .object({
      approvedPence: z.number(),
      deltaPence: z.number(),
      ytdMiles: z.number().optional(),
      crossedThreshold: z.boolean().optional(),
      bandMiles45: z.number().optional(),
      bandMiles25: z.number().optional(),
    })
    .optional(),
  reasons: z.array(z.string()),
  warnings: z.array(warningSchema),
});
export type Estimate = z.infer<typeof estimateSchema>;

export const roadCompositionSchema = z.object({
  urban: z.number(),
  rural: z.number(),
  motorway: z.number(),
});
export type RoadComposition = z.infer<typeof roadCompositionSchema>;

export const routeResultSchema = z.object({
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  encodedPolyline: z.string(),
  roadComposition: roadCompositionSchema.optional(),
  providerFuelLitres: z.number().optional(),
  provider: z.string(),
});
export type RouteResult = z.infer<typeof routeResultSchema>;
