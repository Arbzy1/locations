import type { ChargeScheme } from "./types.js";
import { CHARGE_CATALOGUE } from "./catalogue.js";

export function schemeToGeoJsonFeature(scheme: ChargeScheme) {
  return {
    type: "Feature" as const,
    properties: {
      id: scheme.id,
      name: scheme.name,
      ...(scheme.authority ? { authority: scheme.authority } : {}),
      kind: scheme.schemeKind === "toll" ? "toll" : scheme.schemeKind,
      ...(scheme.cazClass ? { caz_class: scheme.cazClass } : {}),
      ...(scheme.chargePence !== undefined ? { charge_pence: scheme.chargePence } : {}),
      ...(scheme.chargePenceByClass ? { charge_pence_by_class: scheme.chargePenceByClass } : {}),
      is_restriction: scheme.isRestriction,
      applies_hours_json: scheme.appliesHours,
      source_url: scheme.sourceUrl,
      verified_on: scheme.verifiedOn,
      operator_url: scheme.operatorUrl,
      dataset_version: scheme.datasetVersion,
    },
    geometry: scheme.geometry,
  };
}

export function catalogueToFeatureCollection(schemes: ChargeScheme[] = CHARGE_CATALOGUE) {
  return {
    type: "FeatureCollection" as const,
    features: schemes.map(schemeToGeoJsonFeature),
  };
}
