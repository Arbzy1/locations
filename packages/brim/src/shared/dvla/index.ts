export type { JoinOutcome, VesParseSkip, VesVehicle } from "./types.js";
export {
  CURRENT_UK_VRM,
  DVLA_VES_ORIGIN,
  JOIN_CC_TOLERANCE,
  JOIN_CO2_TOLERANCE,
  JOIN_MAX_USEFUL,
  JOIN_OVERFLOW,
} from "./types.js";
export { mapDvlaFuel, normaliseVrm } from "./normalise.js";
export { joinOutcome, joinVca } from "./join.js";
export { dvlaVesBody, dvlaVesHeaders, dvlaVesUrl, parseVesJson } from "./pull.js";
